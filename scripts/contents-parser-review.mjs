// Human audit judgments. Never production grammar or bibliographic repair rules.
export const lossReasons={
 48:'Spider-Man Versus Wolverine must not merge into the following Web of Spider-Man numeric label. Keep the ambiguous clause unresolved.',
 77:'Move the explicit Animal Man year range into run; all six numbers remain. Undated clauses stay undated.',
 85:'Preserve the explicit Justice League label and year scope separately from newly anchored Aquaman issues.',
 98:'The ampersand separates two Lorna titles. Replace the truncated Jungle Girl label with its explicit Lorna label; all nine units survive.',
 157:'A short story from Detective Comics is an excerpt. Remove the prose prefix from the label.',
 209:'Move the printed year range into run. Special #1 becomes a special rather than an issue of a label containing Special and years.',
 254:'The narrative introduction/Reprinting prefix cannot become a Detective Comics series. Subsequent ranges survive; the initial clause remains unresolved.',
 278:'Gaiman stories from Secret Origins establishes excerpt scope for the list. Remove creator attribution from the label; all three units become excerpts.',
 357:'Move the explicit Catwoman year range into run; all six printed numbers remain.',
 367:'Keep Illuminati One-Shot unresolved; recover the following explicit Amazing Spider-Man range under its own label/year.',
 442:'A contributor pair is not a series. Run Ragged/from Witching Hour remains unresolved; subsequent Ghosts and Time Warp retain excerpt scope.',
 448:'Backup stories from Aquaman sets excerpt scope, including the following Challengers clause. Remove the backup-prose series prefix.',
 545:'Final Crisis: Submit cannot merge into numbered Batman. The ambiguous clause and Absolute Final Crisis excerpt remain visible.',
 603:'Separate named Ignition from six explicitly numbered Thanos Imperative issues. Ignition remains unresolved.',
 626:'Actual Hellboy evidence cannot justify a numeric series named The Unreasoning Beast, Ghost Moon. Two Black Sun issues survive; neighboring names/range remain unresolved.',
 691:'The Annual inherits the explicit current series; the word the is no longer an annual series.',
 773:'Justice League Dark backup stories from Justice League supplies excerpt scope, including the annual. Preserve printed annual #1, never invent #2021.',
 788:'The possessive run on grammar separates Jack Kirby attribution from Kamandi, the Last Boy on Earth. All twenty explicit numbers survive.',
 921:'Annual 2001 is a year without hash-number identity. Keep unresolved instead of inventing annual #2001.',
 991:'Preserve explicit Batman and Teen Titans labels with their runs; newly anchored Red Hood ranges replace neither.',
 1056:'Spider-Women Alpha cannot merge into the SILK numeric label. Alpha/SILK ambiguity and Omega remain unresolved; other series survive.',
 1088:'Separate unidentified Special from dated Droids. All eight issues retain their own label/year; Special remains unresolved.',
 1091:'Dark Horse Presents Annual 2000 is a year reference, not annual #2000. Keep unresolved bare prose/numbers visible.',
 1097:'A named Star Wars Special and Classic Star Wars range were merged. Keep the ambiguous clause and dated newspaper-strip interval unresolved.',
 1162:'Supergirl backup stories from Action Comics are excerpts. Preserve all 33 numbers under Action Comics with excerpt scope.',
 1163:'Preserve 23 Action Comics numbers as excerpts; contributor/artist commentary stays unresolved.',
 1199:'Pages from Aquaman is an excerpt, replacing the prior full-issue claim; seven Swamp Thing issues are recovered.',
 1225:'The quoted pre-game story cannot merge with TMNT #84. Annual years cannot become issue #2020 or attach to Opening Moves. Structure only explicit Opening Moves #1 and #2.',
 1257:'The old nine units used a creator/marketing sentence as their series. Keep the ambiguous attribution/manifest unresolved without catalogue inference.',
 1364:'Two annual years are not issue numbers. Keep unresolved alongside the existing negative-number supplement.',
 1365:'Two Annual 2000 references stay unresolved instead of invented annual #2000; all other explicit ranges survive.',
 1479:'DC Holiday Special 2017 is a year-based name without an explicit number. Remove invented special #2017; preserve twelve other numbered units.',
 1497:'Stryfe’s Strike File and X-Men Unlimited cannot be one numeric series. Keep ambiguous named/numeric clause unresolved.'
};
export const defectiveFull=[48,157,209,254,278,367,442,448,603,626,691,788,921,1088,1162,1225,1365,1479,1497];
export const malformedFull=defectiveFull.filter(id=>![209,921,1365,1479].includes(id));
export const ambiguousSupplements=[48,367,498,545,603,626,1056,1088,1097,1225,1497];
export const improvedSample=[21,34,42,44,79,84,85,86,96,98,160,189,240,241,242,258,259,284,478,496,577,661,688,715,939,1195,1199,1333,1334,1474];
export const remainingSample=[65,370,498,508,609,697,901,959,973,975,1081,1223,1264,1313,1482];
export function reviewNote(row){
 if(lossReasons[row.auditId])return {reason:lossReasons[row.auditId],confidence:'High for the stated correction; unresolved constituents still require source review.'};
 if(row.suspiciousAfter.length)return {reason:'Flagged punctuation/length occurs in literal explicit source titles, rather than a neighboring work absorbed into a label. Numbered clauses remain separate; Full is still unverified.',confidence:'High for literal grammar; no external bibliographic verification.'};
 if(row.added.length){
  const reason=row.families.includes('run-volume')?'Represent explicit volume as run independently of issue numbers; preserve unsupported supplements and excerpt scope.':row.after.parseBinding?.startsWith('explicit-product-')?'Exact product series plus volume/book supplies the missing initial label. Explicit secondary series, qualifiers and residual prose remain separate.':row.auditId===21?'Represent the explicitly delimited novel name as an excerpt in its containing book; do not claim the whole novel.':'Finite separators/scope qualifiers recover explicit units without unstated numbers or discarded unresolved material.';
  return {reason,confidence:row.after.parseBinding?.startsWith('explicit-product-')?'Medium: exact product context supplies the label; users must verify the edition/constituents.':'High for stated grammar; proposals remain unverified.'};
 }
 return {reason:row.after.outcome==='uncertain'?'Captured source may be incomplete or semantically uncertain; no names/numbers are inferred.':'Source lacks safe constituent delimiters/identity or contains unresolved attribution, topics, prose or unnamed supplements. Preserve literal evidence for review.',confidence:'High that automatic reconstruction is unjustified; constituent identity remains uncertain.'};
}
