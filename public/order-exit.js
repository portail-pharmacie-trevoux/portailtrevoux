export async function saveAndLockOrders(editor,lock){
 if(typeof editor?.saveBeforeExit!=='function')throw Error('L’enregistrement des commandes est indisponible. Réessayez.');
 await editor.saveBeforeExit();
 await lock();
}
