import assert from 'node:assert/strict';
import {createSupabaseSyncAdapter} from '../js/infrastructure/adapters/supabase-sync-adapter.js';
import {createCloudSyncService} from '../js/application/services/cloud-sync-service.js';

const calls=[];
const chain=(result)=>({select(){calls.push('select');return this},eq(){calls.push('eq');return this},maybeSingle:async()=>result,upsert:async rows=>{calls.push(['upsert',rows]);return result},delete(){calls.push('delete');return this}});
const client={from(){return chain({data:[{id:'x'}],error:null})},storage:{from(){return {upload:async()=>({error:null}),download:async()=>({data:{},error:null}),remove:async()=>({error:null}),list:async()=>({data:[],error:null})}}}};
const gateway=createSupabaseSyncAdapter({client,bucket:'b'});
assert.equal(typeof gateway.fetchRow,'function');
await gateway.fetchRow('x');
await gateway.upsertRows([{id:'x'}]);
assert.equal(calls[0],'select');
assert.equal(calls[1],'eq');
assert.equal(calls[2][0],'upsert');

const service=createCloudSyncService({gateway,isAvailable:()=>true,isOnline:()=>true});
assert.equal(service.canSync(),true);
assert.equal(typeof service.listStorage,'function');
assert.equal(service.gateway,undefined);
console.log('cloud sync step35 standalone: 7/7 passed');
