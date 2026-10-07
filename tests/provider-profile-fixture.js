export const activeRecord=(db,provider,native)=>Object.values(db.providerItems).find(i=>i.provider===provider&&i.providerItemId===native&&i.profileId===db.providers[provider]?.activeProfileId);
