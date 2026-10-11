export class Node {
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this._text=text;this.children=[];this.dataset={};this.style={};this.listeners={};this.attributes={};this.hidden=false;this.disabled=false;this._value='';}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(c=>c!==n);n.parentElement=this;this.children.push(n);}}
 after(node){const p=this.parentElement;if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(c=>c!==node);node.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,node);}
 prepend(...nodes){for(const n of nodes.reverse()){n.parentElement=this;this.children.unshift(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 get firstChild(){return this.children[0];}
 get options(){return this.children;}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get value(){return this.tagName==='SELECT'?this._value||this.children[0]?.value||'':this._value;}
 set value(value){this._value=String(value);}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 async event(name){await Promise.all((this.listeners[name]??[]).map(fn=>fn({target:this})));}
 async click(){if(!this.disabled)await this.event('click');}
 closest(tag){for(let n=this;n;n=n.parentElement)if(n.tagName===tag.toUpperCase())return n;return null;}
 querySelector(tag){return this.children.find(n=>n.tagName===tag.toUpperCase())??null;}
 focus(){this.focused=true;}
}
