/** Repository boundary; concrete legacy storage is migrated behind this interface incrementally. */
export function createRepository({list,save,remove}){return {list:list||(()=>[]),save:save||(()=>undefined),remove:remove||(()=>undefined)};}
