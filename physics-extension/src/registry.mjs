import { createZigzagWorld, zigzagSpec } from './planck2d.mjs';
import { createPrismWorld, prismSpec } from './rapier3d.mjs';

// Extension registry only. Never add these IDs to the original 45-mode live
// registry until a preview QA release explicitly enables the integration.
const descriptors = [
  { slug:'neon-zigzag', title:'Neon Zigzag Beat Rail', dimension:'2d', backend:'planck', status:'prototype', options:zigzagSpec, create:createZigzagWorld },
  { slug:'prism-chain', title:'Prism Chain Reaction', dimension:'3d', backend:'rapier', status:'prototype', options:prismSpec, create:createPrismWorld }
];
export const newModePrototypes=Object.freeze(descriptors.map(mode=>Object.freeze(mode)));
export function findPrototype(slug){return newModePrototypes.find(x=>x.slug===slug)??null;}
export async function launchPrototype(slug,config={}, {enabled=false}={}){
  if(!enabled)throw new Error('Experimental physics is disabled; original Studio remains unchanged');
  const mode=findPrototype(slug);
  if(!mode)throw new Error('Unknown experimental mode: '+slug);
  return mode.create(config);
}
