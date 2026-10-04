export function calculatePromoFlash(values){
  const errors=[];
  function number(key,label,{min=0,max=1e9,integer=false}={}){
    const raw=String(values[key]??'').trim().replace(/\s/g,'').replace(',','.');
    if(!/^(\d+(\.\d*)?|\.\d+)$/.test(raw)){errors.push(label+' : renseignez un nombre.');return null;}
    const value=Number(raw);if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))){errors.push(label+' : valeur invalide.');return null;}return value;
  }
  const catalogue=number('catalogue','Prix catalogue'),floorDiscount=number('discount_floor','Remise fond de rayon',{max:100}),promoDiscount=number('discount_promo','Remise promo',{max:100});
  const extraTotal=values.extra_enabled?number('extra_total','Rémunération totale récupérée'):0;
  const extraUnits=values.extra_enabled?number('extra_units','Nombre d’unités engagées',{min:1,max:1000000,integer:true}):1;
  const floorSell=number('sell_floor','Prix de vente habituel'),promoSell=number('sell_promo','Prix de vente promo'),monthly=number('monthly','Ventes mensuelles',{max:1000000,integer:true});
  const vat=Number(values.vat);if(![20,10,5.5,2.1].includes(vat))errors.push('TVA invalide.');
  if(errors.length)return {errors};
  const extra=extraTotal/extraUnits;
  const costFloor=catalogue*(1-floorDiscount/100),costPromo=catalogue*(1-promoDiscount/100),netPromo=costPromo-extra;
  const stable=value=>Math.abs(value)<1e-9?0:value;
  const marginFloor=stable(floorSell/(1+vat/100)-costFloor),marginPromo=stable(promoSell/(1+vat/100)-netPromo);
  const baseMargin=monthly*marginFloor,promoX2=monthly*2*marginPromo;
  const units=marginPromo>0&&baseMargin>0?Math.ceil(baseMargin/marginPromo-1e-9):null;
  const factor=units!==null&&monthly>0?units/monthly:null;
  return {errors:[],costFloor,costPromo,netPromo,extraPerUnit:extra,extraAboveCost:extra>costPromo,marginFloor,marginPromo,
    rateFloor:costFloor>0?marginFloor/costFloor:null,ratePromo:netPromo>0?marginPromo/netPromo:null,
    coefFloor:costFloor>0?floorSell/costFloor:null,coefPromo:netPromo>0?promoSell/netPromo:null,
    baseMargin,units,factor,promoX2,gainX2:promoX2-baseMargin,
    simulations:[1,1.5,2,2.5,3].map(multiplier=>({multiplier,margin:monthly*multiplier*marginPromo})),
    zone:factor===null?'none':factor<=2?'green':factor<3?'orange':'red'};
}
