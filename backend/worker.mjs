// Deploy this module to Cloudflare Workers. Secrets belong in Worker settings.
const STYLES = {
  none: '',
  impressionism: '印象派绘画，细碎笔触，柔和的自然光与丰富色彩',
  illustration: '自然插画，简洁色块，细腻纸张纹理',
  dream: '梦境幻想，超现实场景，朦胧光晕',
  geometry: '极简几何艺术，清晰形状，克制配色'
};
const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
async function sameSecret(a,b){
  const encoder=new TextEncoder();
  const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encoder.encode(s))));
  const xa=new Uint8Array(x),ya=new Uint8Array(y);let diff=0;
  for(let i=0;i<xa.length;i++)diff|=xa[i]^ya[i];
  return diff===0;
}
async function readJSON(request){
  if(Number(request.headers.get('Content-Length')||0)>16384)throw new Error('large');
  if(!request.body)throw new Error('empty');
  const reader=request.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new Error('large')}chunks.push(value)}}finally{reader.releaseLock()}
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder().decode(body));
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin');
    const allowedOrigin=env.ALLOWED_ORIGIN||'https://zhaoyao75.github.io';
    const headers={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin===allowedOrigin)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Creation-Code'});
    const error=(message,status)=>Response.json({error:message},{status,headers});
    if(origin!==allowedOrigin)return error('此来源不允许访问。',403);
    if(new URL(request.url).pathname!=='/generate')return error('接口不存在。',404);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return error('仅支持 POST 请求。',405);
    if(!env.OPENAI_API_KEY||!env.GENERATE_ACCESS_CODE)return error('绘图服务尚未配置完成，请联系站主。',503);
    const code=request.headers.get('X-Creation-Code')||'';
    if(code.length>200||!await sameSecret(code,env.GENERATE_ACCESS_CODE))return error('创作口令不正确。',401);
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return error('请求格式应为 JSON。',415);
    let body;try{body=await readJSON(request)}catch(e){return error(e.message==='large'?'请求内容过长。':'请求内容不是有效的 JSON。',e.message==='large'?413:400)}
    if(!body||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>2000)return error('请输入 1—2000 字的提示词。',400);
    const style=body.style??'none',size=body.size??'1024x1024';
    if(typeof style!=='string'||!Object.hasOwn(STYLES,style)||!SIZES.has(size))return error('风格或图片比例无效。',400);
    const prompt=body.prompt.trim()+(STYLES[style]?'。画面风格：'+STYLES[style]:'');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),210000);
    try{
      const upstream=await fetch('https://api.openai.com/v1/images/generations',{
        method:'POST',headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:env.IMAGE_MODEL||'gpt-image-1.5',prompt,n:1,size,quality:'low',output_format:'png'}),signal:controller.signal
      });
      if(!upstream.ok){
        if(upstream.status===429)return error('绘图服务额度不足或请求过多，请稍后重试或联系站主。',429);
        if(upstream.status===400)return error('绘图服务无法处理该请求，请调整提示词；若持续失败，请联系站主检查模型配置。',400);
        if(upstream.status===401||upstream.status===403)return error('绘图服务授权不可用，请联系站主。',503);
        return error('绘图服务暂不可用，请稍后重试。',502);
      }
      const json=await upstream.json(),base64=json.data?.[0]?.b64_json;
      if(typeof base64!=='string'||!base64)return error('绘图服务未返回图片，请稍后重试。',502);
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
      if(bytes.length<8||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return error('绘图服务返回的图片格式无效。',502);
      return new Response(bytes,{status:200,headers:{...headers,'Content-Type':'image/png'}});
    }catch(e){return error(e.name==='AbortError'?'绘图请求超时，请稍后再试。':'绘图服务连接失败，请稍后再试。',504)}
    finally{clearTimeout(timer)}
  }
};
