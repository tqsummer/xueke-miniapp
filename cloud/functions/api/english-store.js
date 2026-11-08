'use strict'
// This collection must deny all client SDK access. Only server-derived account IDs enter here.
const missing=e=>/document.*(?:does not exist|not exist|not found)/i.test(String(e.errMsg||e.message||''))
function createEnglishStore(db){
 const readDoc=async ref=>{try{const r=await ref.get();if(!r.data)return null;const {_id,...data}=r.data;return data}catch(e){if(missing(e))return null;throw e}}
 return {
  read:id=>readDoc(db.collection('english_progress').doc(id)),
  transact:(id,fn)=>db.runTransaction(async tx=>{const ref=tx.collection('english_progress').doc(id);const previous=await readDoc(ref);const next=fn(previous);await ref.set({data:next});return next})
 }
}
module.exports={createEnglishStore}
