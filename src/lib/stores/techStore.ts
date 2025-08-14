import { writable } from 'svelte/store';
const KEY='showTech';
const initial = typeof localStorage!=='undefined' ? localStorage.getItem(KEY)==='true' : true;
export const showTech = writable<boolean>(initial);
showTech.subscribe(v=>{ if(typeof document!=='undefined'){ document.documentElement.dataset.tech = v ? 'on' : 'off'; localStorage.setItem(KEY,String(v)); } });
