"use strict";

(()=>{
  const extension=globalThis.chrome??globalThis.browser;
  window.addEventListener("message",(event)=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.type!=="pbrl-catalog-request"||typeof event.data.id!=="string") return;
    const id=event.data.id;
    extension.runtime.sendMessage({type:"pbrl-catalog"},(response)=>{
      const failed=extension.runtime.lastError;
      window.postMessage({type:"pbrl-catalog-response",id,snapshot:failed?null:response?.snapshot},location.origin);
    });
  });
  function markReady(){
    document.documentElement.setAttribute("data-pbrl-ready","");
    window.dispatchEvent(new CustomEvent("pbrl-extension-ready"));
  }
  if(document.documentElement) markReady();
  else document.addEventListener("DOMContentLoaded",markReady,{once:true});
})();
