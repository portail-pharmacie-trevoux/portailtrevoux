export const isOrderService=name=>/^commandes? programmees?(?:\b|$)/.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim());
export async function canManageOrderTools(db,user){
 if(user.role==='admin')return true;
 const services=(await db.query('SELECT s.service FROM quality_services s JOIN users u ON u.id=s.collaborator_id WHERE s.collaborator_id=$1 AND u.active=TRUE',[user.id])).rows;
 return services.some(row=>isOrderService(row.service));
}
