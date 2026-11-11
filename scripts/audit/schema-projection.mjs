// For trusted versioned project SQL only, not a general-purpose SQL sanitizer.
// Code-audit helper only. Structural projection excludes all business DML and DO blocks.
export function structuralProjection(sql){
 const statements=[];let start=0,quote=null,dollar=null,line=false,block=false;
 for(let i=0;i<sql.length;i++){
  const c=sql[i],n=sql[i+1];
  if(line){if(c==='\n')line=false;continue;}
  if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
  if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
  if(quote){if(c===quote){if(n===quote)i++;else quote=null;}continue;}
  if(c==='-'&&n==='-'){line=true;i++;continue;}
  if(c==='/'&&n==='*'){block=true;i++;continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='$'){const match=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);if(match){dollar=match[0];i+=dollar.length-1;continue;}}
  if(c===';'){statements.push(sql.slice(start,i+1));start=i+1;}
 }
 if(quote||dollar||block)throw Error('UNTERMINATED_SCHEMA_STATEMENT');
 if(sql.slice(start).trim())statements.push(sql.slice(start));
 const structural=[],omitted=[];
 for(const statement of statements){const text=statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'').trim();if(!text)continue;
  if(/^(?:CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)|ALTER\s+TABLE|DROP\s+INDEX)\b/i.test(text))structural.push(text);
  else omitted.push({kind:text.match(/^\w+/)?.[0]||'unknown'});
 }
 return {sql:structural.join('\n'),structuralStatements:structural.length,omitted};
}
