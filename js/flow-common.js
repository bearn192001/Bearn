export async function currentUser(){const c=window.BEARN?.client;if(!c)return null;const {data,error}=await c.auth.getUser();return error?null:data?.user||null;}
export function slug(){return Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);}
export function message(id,text){const n=document.getElementById(id);if(n)n.textContent=text;}
export function money(n){return 'Rp'+Number(n||0).toLocaleString('id-ID');}
export function param(k){return new URLSearchParams(location.search).get(k);}
