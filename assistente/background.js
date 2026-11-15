"use strict";

const extension=globalThis.chrome??globalThis.browser;
let loading=null;

function allowed(sender){
  try {
    const url=new URL(sender.url);
    return url.origin==="https://pokebonk.com"||url.origin==="https://www.pokebonk.com"||
      (url.origin==="https://killumy.github.io"&&url.pathname.startsWith("/pokebonk-run-lab/"));
  } catch { return false; }
}

extension.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=="pbrl-catalog"||!allowed(sender)) return false;
  if(!loading){
    loading=BONK_CATALOG.fetchInput().then((input)=>BONK_CATALOG.extract(input,window.BONK)).finally(()=>{loading=null;});
  }
  loading.then((snapshot)=>respond({ok:true,snapshot}),()=>respond({ok:false}));
  return true;
});
