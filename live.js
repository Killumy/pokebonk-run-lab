"use strict";

(()=>{
  const catalogueUrl="https://killumy.github.io/pokebonk-run-lab/sync/snapshot.json";
  let latest=0;
  const status=document.getElementById("data-status");
  const ready=()=>document.documentElement.hasAttribute("data-pbrl-ready");
  function say(value){if(status) status.textContent=value;}
  function apply(snapshot,direct){
    if(snapshot?.schema!==1||!snapshot.data?.pokemon?.length||!snapshot.data.moves||
      !Array.isArray(snapshot.data.items)||!Array.isArray(snapshot.data.vitamins)||!Array.isArray(snapshot.data.fusions)||
      !Array.isArray(snapshot.tiers)||!snapshot.meta?.checkedAt) return false;
    const ranked=snapshot.tiers.flatMap(([,keys])=>keys);
    const partners=snapshot.data.pokemon.filter((p)=>p.league);
    if(ranked.length!==partners.length||new Set(ranked).size!==ranked.length||
      partners.some((p)=>!ranked.includes(p.key)||p.league.kit.some((key)=>!snapshot.data.moves[key]))) return false;
    const checked=Date.parse(snapshot.meta.checkedAt);
    if(!Number.isFinite(checked)||checked<latest) return false;
    latest=checked;
    Object.assign(window.BONK,snapshot.data);
    window.BONK_META={...snapshot.meta,direct};
    window.BONK_TIERS=snapshot.tiers;
    if(window.BONK_ASSIST_ALIASES){
      for(const [group,entries] of Object.entries(snapshot.aliases??{})){
        Object.assign(window.BONK_ASSIST_ALIASES[group]??={},entries);
      }
    }
    const date=new Intl.DateTimeFormat("it-CH",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(checked);
    say("Dati gioco v"+snapshot.meta.gameVersion+" · controllo "+date+" · "+(direct?"sincronizzato ora":"ultima sincronizzazione disponibile")+" · tier stimati");
    window.dispatchEvent(new CustomEvent("bonk-catalog-updated"));
    return true;
  }
  function requestDirect(){
    const request=()=>{
      const id=crypto.randomUUID();
      const receive=(event)=>{
        if(event.source!==window||event.origin!==location.origin||event.data?.type!=="pbrl-catalog-response"||event.data.id!==id) return;
        window.removeEventListener("message",receive);
        clearTimeout(timer);
        if(event.data.snapshot) apply(event.data.snapshot,true);
        else say((status?.textContent??"")+" · controllo live non riuscito");
      };
      window.addEventListener("message",receive);
      const timer=setTimeout(()=>{window.removeEventListener("message",receive);},45000);
      window.postMessage({type:"pbrl-catalog-request",id},location.origin);
    };
    if(ready()) request();
    else window.addEventListener("pbrl-extension-ready",request,{once:true});
  }
  async function check(){
    say("Controllo aggiornamenti del catalogo…");
    requestDirect();
    try {
      const response=await fetch(catalogueUrl+"?check="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(10000)});
      if(!response.ok||!apply(await response.json(),false)) throw Error("Catalogo non valido");
    } catch {
      if(!latest) say("Catalogo salvato v"+window.BONK.version+" · verifica online non riuscita");
    }
  }
  window.BONK_LIVE={apply,check};
  check();
  window.addEventListener("pageshow",(event)=>{if(event.persisted) check();});
})();
