import {PROVIDER_SITES} from './provider-accounts.js';
import {providerLabel} from './formatters.js';

const providerArtwork={steam:'steam',gog:'gog',epic:'epic-games','amazon-games':'amazon-games',audible:'audible',kindle:'kindle','amazon-video':'amazon-video','fandango-at-home':'fandango-at-home',kobo:'kobo',fanatical:'fanatical',humble:'humble-bundle',xbox:'xbox',playstation:'playstation',nintendo:'nintendo'};

// Both views share source assets and the resolved-theme CSS. Provider cards
// already show a name; icon-only Library indicators need an accessible one.
export function providerLogo(provider,{size=36,decorative=true,onUnavailable}={}){
 const artwork=providerArtwork[provider];if(!artwork)return null;
 const logo=document.createElement('span');logo.className='provider-logo';
 if(decorative)logo.setAttribute('aria-hidden','true');
 else{const label=PROVIDER_SITES.find(site=>site.provider===provider)?.name??providerLabel(provider);logo.setAttribute('role','img');logo.setAttribute('aria-label',label);logo.title=label;}
 for(const theme of provider==='epic'?['light','dark']:['']){
  const image=document.createElement('img');image.src=`icons/provider-icons/${artwork}${theme?'-'+theme:''}-64.png`;image.alt='';image.width=size;image.height=size;
  if(theme)image.dataset.logoTheme=theme;
  image.addEventListener('error',()=>{if(onUnavailable){onUnavailable(logo);return;}image.remove();if(!logo.childElementCount)logo.remove();});logo.append(image);
 }
 return logo;
}
