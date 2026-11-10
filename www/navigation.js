'use strict';
(() => {
 const sidebar=document.getElementById('appSidebar');
 const scrim=document.getElementById('navScrim');
 const openButton=document.getElementById('mobileMenuOpen');
 const moreButton=document.getElementById('mobileMenuMore');
 const closeButton=document.getElementById('mobileMenuClose');
 const tabbar=document.querySelector('.mobile-tabbar');
 const workspace=document.querySelector('.workspace');
 if(!sidebar||!scrim||!openButton||!moreButton||!closeButton)return;
 const mobile=window.matchMedia('(max-width:800px)');
 let opened=false,opener=null,backgroundState=null;
 const triggers=[openButton,moreButton];
 function focusable(){
  return [...sidebar.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')]
   .filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
 }
 function setBackgroundInert(value){
  if(value){
   backgroundState=[workspace,tabbar].filter(Boolean).map(el=>({el,inert:el.inert}));
   for(const {el}of backgroundState)el.inert=true;
  }else if(backgroundState){
   for(const {el,inert}of backgroundState)el.inert=inert;
   backgroundState=null;
  }
 }
 function open(event){
  if(!mobile.matches||opened)return;
  opener=event?.currentTarget||document.activeElement;opened=true;
  sidebar.inert=false;sidebar.removeAttribute('aria-hidden');
  sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');
  sidebar.setAttribute('aria-label','Hauptmenü');
  document.body.classList.add('nav-open');scrim.hidden=false;
  for(const button of triggers)button.setAttribute('aria-expanded','true');
  setBackgroundInert(true);closeButton.focus({preventScroll:true});
 }
 function close({restore=true}={}){
  const wasOpened=opened;opened=false;
  document.body.classList.remove('nav-open');scrim.hidden=true;
  for(const button of triggers)button.setAttribute('aria-expanded','false');
  setBackgroundInert(false);
  sidebar.removeAttribute('aria-modal');sidebar.removeAttribute('role');sidebar.removeAttribute('aria-label');
  if(mobile.matches){sidebar.inert=true;sidebar.setAttribute('aria-hidden','true');}
  else {sidebar.inert=false;sidebar.removeAttribute('aria-hidden');}
  if(restore&&wasOpened&&opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});
 }
 for(const button of triggers)button.addEventListener('click',open);
 closeButton.addEventListener('click',()=>close());
 scrim.addEventListener('click',()=>close());
 document.addEventListener('click',event=>{
  if(!opened)return;
  const route=event.target.closest('[data-page],[data-goto]');
  if(!route||!sidebar.contains(route))return;
  close({restore:false});
  requestAnimationFrame(()=>document.getElementById('pageTitle')?.focus({preventScroll:true}));
 });
 document.addEventListener('keydown',event=>{
  if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key!=='Tab')return;
  const items=focusable(),first=items[0]||sidebar,last=items.at(-1)||sidebar,current=document.activeElement;
  if(event.shiftKey&&(current===first||!sidebar.contains(current))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(current===last||!sidebar.contains(current))){event.preventDefault();first.focus();}
 });
 document.addEventListener('focusin',event=>{
  if(opened&&!sidebar.contains(event.target))(focusable()[0]||sidebar).focus({preventScroll:true});
 });
 mobile.addEventListener('change',()=>close({restore:false}));
 close({restore:false});
})();
