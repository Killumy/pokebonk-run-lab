"use strict";

const fs=require("node:fs");
const vm=require("node:vm");
const {extract,fetchInput}=require("../sync/catalog.js");

async function main(){
  const root=require("node:path").resolve(__dirname,"..");
  const read=(file)=>fs.readFileSync(root+"/"+file,"utf8");
  const context={window:{}};
  vm.runInNewContext(read("data.js"),context);
  vm.runInNewContext(read("assistente/aliases.js"),context);
  context.window.BONK.rankingReference=JSON.parse(read("sync/ranking-reference.json"));
  const snapshot=extract(await fetchInput(),context.window.BONK);
  for(const [group,entries] of Object.entries(snapshot.aliases)){
    Object.assign(context.window.BONK_ASSIST_ALIASES[group]??={},entries);
  }
  // All validation finishes before files are replaced. A failure leaves the last valid snapshot intact.
  const output={
    "data.js":"window.BONK = "+JSON.stringify(snapshot.data)+";\n",
    "assistente/aliases.js":'"use strict";\nwindow.BONK_ASSIST_ALIASES='+JSON.stringify(context.window.BONK_ASSIST_ALIASES)+";\n",
    "sync/snapshot.json":JSON.stringify(snapshot)+"\n"
  };
  for(const [path,content] of Object.entries(output)) fs.writeFileSync(root+"/"+path,content);
  console.log("Catalogo aggiornato a "+snapshot.meta.gameVersion+" · "+snapshot.meta.checkedAt);
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
