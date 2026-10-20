import {reviewedContents} from '../lib/contents.js';
import {createRelationshipPicker} from './relationship-picker.js';
import {preferredDisplayTitle} from '../lib/display-title.js';
import {performAction} from './operation-feedback.js';
import {labeledControl,presentAction} from './form-presentation.js';
import { compact, identityConflicts, identityEvidence, names, validIsbn } from '../lib/identity.js';
import { contentCoverage } from '../lib/contents.js';
import { entitlementEvidence,effectiveOwnershipRecord } from '../lib/ownership.js';
import {accountLabel} from './item-presentation.js';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
const display=value=>Array.isArray(value)?value.join(', ')||'Unknown':value||'Unknown';
const decisionLabel=value=>value==='different'?'Different works':value==='same-edition'?'Same edition':'Same work';

function sourceLink(url,label) {
  try{
    const parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;
    const link=element('a',label);link.href=`${parsed.origin}${parsed.pathname}`;
    if(parsed.hostname==='books.google.com'&&parsed.searchParams.has('id'))link.href+=`?id=${encodeURIComponent(parsed.searchParams.get('id'))}`;
    link.target='_blank';link.rel='noreferrer noopener';return link;
  }catch{return null;}
}

/** Populate on expansion so thousands of closed cards stay inexpensive. */
export function createEvidenceInspector(canonical, records, database, actions, {separateTechnical=false}={}) {
  const root=document.createElement('details');root.className='evidence-inspector';
  root.append(element('summary',separateTechnical?'Matching and editions':'Matching, editions and source evidence'));
  const technical=element('details','');technical.className='identity-technical-details';technical.append(element('summary','Account sources and technical evidence'));root.technical=technical;
  let populated=false;
  function populate(){if(populated)return;populated=true;
    root.append(element('p','Same work keeps editions separate and supports Possible warnings for related copies. Same edition groups copies only when known identity details agree. Different works prevents that relationship and grouping. These choices do not confirm a purchase. Separating a copy keeps it in its own edition.'));
    technical.append(element('p',`Persistent edition IDs: ${(canonical.sourceCanonicalIds??[canonical.id]).join(', ')}`));
    const editions=element('div','');editions.className='edition-record-actions';
    for(const record of records){
      const identity=identityEvidence(record);const provider=database.providerProfiles?.[record.profileId]?.state??database.providers[record.provider]??{},effective=effectiveOwnershipRecord(record,database);
      const section=element('section','');section.append(element('h4',`${record.title} — ${accountLabel(record,database)}`));
      const table=element('dl','');table.className='evidence-fields';
      const field=(label,value)=>table.append(element('dt',label),element('dd',display(value)));
      field('Record reference',record.recordRef);field('Ownership evidence',record.ownership);field('Evidence source',identity.source);
      if(effective.ownershipOverride)field('Display and matching','Owned (user preference; original evidence retained)');
      const ownershipReview=database.ownershipReviews?.[record.recordRef];
      if(ownershipReview){field('Reviewed ownership',effectiveOwnershipRecord(record,database,Date.now(),{ignoreOverride:true}).ownership);field('Ownership confirmed',ownershipReview.confirmedAt);field('Ownership evidence date',ownershipReview.evidenceDate);field('Ownership evidence note',ownershipReview.note);field('Reviewed access expiry',ownershipReview.expiresAt);}
      if(record.provider==='kobo')field('Kobo ownership basis',record.metadata.ownershipBasis||'Library presence only; durable ownership unconfirmed');
      const entitlement=entitlementEvidence(record);
      if(entitlement.purchaseEvidence){field('Reseller purchase evidence',entitlement.purchaseEvidence);field('Destination activation',entitlement.activationStatus);}
      if(entitlement.keyStatus){field('Key status at last observation',entitlement.keyStatus);field('Reported key expiry',entitlement.expiresAt);section.append(element('p','Purchase and key revelation do not establish destination-platform activation. An expired or unavailable key needs review; it does not revoke a separate destination-library record.'));}
      field('Account / profile',compact(provider.accountLabel||provider.profileLabel));
      field('Last observed at provider',record.observedAt);field('Last provider sync (may be incremental)',provider.lastSync);
      field('Record last updated (includes enrichment)',record.updatedAt);field('Acquired / added',record.acquiredAt);
      if(record.metadata.purchaseOrigins?.length){
        field('Purchase occurrences',String(record.metadata.purchaseOrigins.length));
        const origins=element('ul','');for(const origin of record.metadata.purchaseOrigins)origins.append(element('li',`${origin.bundleTitle||'Standalone purchase'} — purchased ${origin.purchasedAt||'date unknown'} — last observed ${origin.observedAt||'unknown'}`));section.append(origins);
      }
      field('Edition label',identity.edition);field('ISBN (checksum validated)',identity.isbn);field('ASIN',identity.asin);field('Steam App ID',identity.steamAppId);
      field('Catalog work identities',identity.workIds);field('Authors',identity.authors);field('Contributors',identity.contributors.map(person=>`${person.name} (${person.role||'role unknown'})`));
      field('Publisher',identity.publisher);field('Language',identity.language);field('Series',identity.series);field('Run / year',identity.run);field('Unit',`${identity.unitType} ${identity.unit}`.trim());field('Format',names(record.metadata?.format||record.metadata?.formats));
      section.append(table);
      const invalidIsbns=names(record.metadata?.isbn||record.metadata?.isbns).filter(value=>!validIsbn(value));
      if(invalidIsbns.length)section.append(element('p',`Invalid source ISBNs ignored for identity: ${invalidIsbns.join(', ')}.`));
      if(!['owned','claimed'].includes(record.ownership))section.append(element('p',effective.ownershipOverride
        ? 'The original provider evidence does not establish permanent ownership. Your preference treats this record and its reviewed contents as owned.'
        : ['owned','claimed'].includes(effective.ownership)
          ? 'The original provider evidence does not establish permanent ownership. Your dated ownership confirmation supplies the effective ownership.'
          : 'This record does not establish permanent ownership. Temporary or unconfirmed access cannot supply owned contents.'));
      if(!record.observedAt)section.append(element('p','This older record has no separate provider-observation date. Enrichment dates are not purchase verification.'));
      const link=sourceLink(record.metadata?.detailUrl,'View provider source');if(link)section.append(link);
      for(const [key,enrichment]of Object.entries(record.metadata?.enrichment??{})){
        if(!enrichment||typeof enrichment!=='object')continue;
        const date=compact(enrichment.appliedAt||enrichment.checkedAt||enrichment.retrievedAt);
        section.append(element('p',`Enrichment: ${compact(enrichment.source||key)} · ${date||'date unknown'} · ${compact(enrichment.workKey||enrichment.volumeId||enrichment.candidateVolumeId)||'source ID unknown'}`));
        if(key==='openLibrary')section.append(element('p','Open Library provides work metadata. Its aggregated ISBNs do not identify your owned edition.'));
        if(key==='googleBooks'||key==='openLibrary'){
          const enriched={...record,title:enrichment.title||record.title,metadata:{authors:enrichment.authors,language:enrichment.language,...(key==='googleBooks'?{isbn:enrichment.isbn}: {})}};
          const conflicts=identityConflicts({...record,metadata:{authors:record.metadata?.authors,language:record.metadata?.language,isbn:record.metadata?.isbn||record.metadata?.isbns,edition:record.metadata?.edition}},enriched);
          if(conflicts.length)section.append(element('p',`Provider versus enrichment conflict: ${conflicts.join(', ')}. Review the selected catalog record.`));
          section.append(element('p',`Catalog authors: ${display(enrichment.authors)} · language: ${display(enrichment.language)}`));
        }
        const enrichmentLink=sourceLink(enrichment.sourceUrl,'View enrichment source');if(enrichmentLink)section.append(enrichmentLink);
      }
      const review=reviewedContents(database.contentReviews?.[record.id]);
      if(review){
        section.append(element('p',`Contents confirmed ${review.verifiedAt||'date unknown'} · ${review.entries.length} entries · ${review.source}`));
        const contents=element('ul','');
        for(const entry of review.entries)contents.append(element('li',`${entry.series} (${entry.run||'run unknown'}) · ${entry.unitType} ${entry.number} · ${entry.language||'language unknown'} · ${entry.completeness}`));
        section.append(contents);
        const coverage=contentCoverage(database,review.entries,{excludeItemIds:[record.id]});
        section.append(element('p',`Other owned records cover ${coverage.owned}/${coverage.total} full entries in this collection. ${coverage.missing.length} entries are not established elsewhere.${coverage.scopeUncertain?' Run/language uncertainty prevents a complete-coverage claim.':''}`));
        const evidenceLink=sourceLink(review.sourceUrl,'View contents evidence');if(evidenceLink)section.append(evidenceLink);
      }else section.append(element('p','No confirmed contents. Title or category hints do not establish collected coverage.'));
      const edition=element('section','');edition.append(element('h4',`${record.title} - ${accountLabel(record,database)}`));
      const relationships=Object.entries(database.manualMatchDecisions??{}).filter(([,decision])=>decision.itemIds.includes(record.id));
      if(records.length>1){
        const split=element('button','Separate this record into its own edition');split.type='button';presentAction(split);
        split.addEventListener('click',async()=>{try{await performAction({status,name:'Separating this edition...',task:()=>actions.split(record.id)});actions.refresh();}catch(error){status.textContent=error.message;}});
        edition.append(split);
      }
      for(const [ref,separation]of Object.entries(database.editionSeparations??{}).filter(([,value])=>value.itemId===record.id)){
        const row=element('p',`Edition kept separate from ${separation.otherItemIds.length} other record(s) · reviewed ${separation.updatedAt||'date unknown'} `);
        const undo=element('button','Undo edition separation');undo.type='button';presentAction(undo);
        undo.addEventListener('click',async()=>{try{await performAction({status,name:'Undoing edition separation...',task:()=>actions.undoSplit(ref)});actions.refresh();}catch(error){status.textContent=error.message;}});
        row.append(undo);edition.append(row);
      }
      for(const [id,decision]of relationships){
        const other=database.providerItems[decision.itemIds.find(itemId=>itemId!==record.id)];
        const row=element('p',`${decisionLabel(decision.decision)}: ${other?`${other.title} — ${accountLabel(other,database)}`:'record no longer in current library'} · reviewed ${decision.updatedAt||'date unknown'} `);
        if(other&&decision.decision==='same-edition'){
          const conflicts=identityConflicts(record,other);
          if(conflicts.length)row.append(element('span',`Current evidence conflicts with this review: ${conflicts.join(', ')}. `));
        }
        const undo=element('button','Undo relationship');undo.type='button';undo.addEventListener('click',async()=>{try{await performAction({status,name:'Removing saved relationship...',task:()=>actions.remove(id)});actions.refresh();}catch(error){status.textContent=error.message;}});row.append(undo);edition.append(row);
      }
      if(edition.querySelector('button'))editions.append(edition);
      technical.append(section);
    }
    const status=element('p','');status.setAttribute('role','status');
    const comparison=element('div','');comparison.className='relationship-review';
    comparison.append(element('p','Same Work: Different editions or versions of the same underlying work. Does not establish identical products. Same work keeps editions separate and can show a Possible match.'));
    comparison.append(element('p','Same Edition: Two records represent the same specific edition/product, even if their source titles differ. Consolidates their display and acquisition history; it does not add purchase evidence. Known edition conflicts still prevent this choice.'));
    comparison.append(element('p','Different works keeps the records separate and blocks indirect grouping. Original titles and purchases are preserved for every choice.'));
    const left=element('select','');left.setAttribute('aria-label','First relationship record');
    for(const record of records){const option=element('option',`${record.title} \u2014 ${accountLabel(record,database)}`);option.value=record.id;left.append(option);}
    const conflicts=element('p','');conflicts.className='identity-conflicts';
    const preferred=element('select','');preferred.setAttribute('aria-label','Preferred title for Same Edition');
    const groupRecords=id=>Object.values(database.canonicalItems).find(group=>group.providerItemIds.includes(id))?.providerItemIds??[id];
    let titleChoices=[];
    const compare=()=>{
      const a=database.providerItems[left.value];const b=database.providerItems[picker.select.value];
      const ids=[...new Set([...groupRecords(left.value),...(b?groupRecords(b.id):[])])];
      titleChoices=ids.map(id=>database.providerItems[id]).filter(Boolean);
      preferred.replaceChildren(...titleChoices.map(record=>{const option=element('option',`${record.title} \u2014 ${accountLabel(record,database)}`);option.value=record.recordRef;return option;}));
      const savedTitle=preferredDisplayTitle(Object.values(database.canonicalItems).filter(group=>group.providerItemIds.some(id=>ids.includes(id))));
      const savedChoice=titleChoices.find(record=>record.title===savedTitle);
      if(savedChoice)preferred.value=savedChoice.recordRef;
      preferred.disabled=!b;
      if(!a||!b){conflicts.textContent='Choose an item to compare editions.';return;}
      const differences=identityConflicts(a,b);
      conflicts.textContent=differences.length?`These details differ: ${differences.join(', ')}. The items can't be combined as the same edition.`:'No known conflicting fields. Missing evidence still needs human review.';
    };
    const picker=createRelationshipPicker(database,()=>left.value,compare);
    left.addEventListener('change',picker.update);
    comparison.append(labeledControl('This account copy',left),picker.root,conflicts,labeledControl('Display title if confirmed as Same Edition',preferred));picker.update();
    comparison.append(element('p','Choose the title to show in the library. Both original source titles remain available below, and you can change this choice later.'));
    for(const value of ['same-work','same-edition','different']){
      const button=element('button',decisionLabel(value));button.type='button';button.addEventListener('click',async()=>{
        const right=picker.select;
        if(!right.value||left.value===right.value){status.textContent='Choose two different records.';return;}
        try{
          const itemIds=[left.value,right.value].sort(),record=titleChoices.find(record=>record.recordRef===preferred.value);
          const choice=value==='same-edition'&&record?{recordRef:record.recordRef,title:record.title}:null;
          await performAction({status,name:'Saving title relationship...',task:()=>actions.save({id:itemIds.join('\u0000'),itemIds},value,choice)});actions.refresh();
        }catch(error){status.textContent=`Could not save relationship: ${error.message}`;}
      });comparison.append(button);
    }
    if(actions.preferredTitle){
      const editor=element('div',''),titles=element('select','');titles.setAttribute('aria-label','Preferred library display title');
      for(const record of records){const option=element('option',`${record.title} \u2014 ${accountLabel(record,database)}`);option.value=record.recordRef;titles.append(option);}
      const groups=(canonical.sourceCanonicalIds??[canonical.id]).map(id=>database.canonicalItems[id]).filter(Boolean);
      const current=preferredDisplayTitle(groups)??canonical.title;
      titles.value=records.find(record=>record.title===current)?.recordRef??records[0].recordRef;
      editor.append(element('p',`Library display title: ${current}. Your choice survives imports and sync; original source titles stay unchanged.`),labeledControl('Preferred library display title',titles));
      const save=element('button','Save display title');save.type='button';save.addEventListener('click',async()=>{
        try{
          const record=records.find(record=>record.recordRef===titles.value),group=groups.find(group=>group.providerItemIds.includes(record?.id));
          await performAction({status,name:'Saving display title...',task:()=>actions.preferredTitle(group?.id,{recordRef:record?.recordRef,title:record?.title})});actions.refresh();
        }catch(error){status.textContent=`Could not save display title: ${error.message}`;}
      });editor.append(save);comparison.prepend(editor);
    }
    root.append(comparison,editions,status);if(!separateTechnical)root.append(technical);
  }
  root.addEventListener('toggle',()=>{if(root.open)populate();});
  technical.addEventListener('toggle',()=>{if(technical.open)populate();});
  return root;
}
