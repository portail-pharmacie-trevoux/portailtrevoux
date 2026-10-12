export const tgGuidelines="=> monoproduit ou au max monogamme\n=> prix promo ou OP promo obligatoire\n=> si nouveauté: offre découverte\n=> EE grand format";
export const isTG=id=>Number.isInteger(id)&&(id>=1&&id<=10||id===24);
export const bsGuidelines="=> petits produits en termes de volume, qu’on peut facilement aller chercher au fond du bac\n=> petits prix inférieurs à 10€\n=> produits colorés\n=> promo par 2 ou 3 bienvenue\nexemples: hydratis, compotes, brumisateurs, fleurs de douche, brosses à dents enfants, gels douche été...";
export const saGuidelines="=> produits de para et/ou compléments alim\n=> traitée par thème, max 3 thèmes sur le longueur complète\nexemples: solaires, moustiques, allergies, rhume, acné...";
export const zoneGuidelines=id=>isTG(id)?tgGuidelines:id>=19&&id<=22?bsGuidelines:id>=25&&id<=28?saGuidelines:undefined;
