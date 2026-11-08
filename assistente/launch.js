"use strict";

function markRunLabReady(){
  document.documentElement.setAttribute("data-pbrl-ready","");
}

if(document.documentElement) markRunLabReady();
else document.addEventListener("DOMContentLoaded",markRunLabReady,{once:true});
