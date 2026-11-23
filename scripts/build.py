from pathlib import Path
import json,mimetypes,hashlib,base64,shutil
root=Path(__file__).resolve().parent.parent;out=root/'dist';out.mkdir(exist_ok=True);(out/'server').mkdir(exist_ok=True);assets={}
for p in sorted((root/'public').rglob('*')):
 if not p.is_file() or '__pycache__' in p.parts or p.suffix=='.pyc':continue
 raw=p.read_bytes();mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
 if p.suffix=='.py':mime='text/plain'
 binary=p.suffix.lower() in ['.png','.jpg','.jpeg','.ico','.woff','.woff2','.ttf','.eot','.zip','.pdf']
 assets['/'+str(p.relative_to(root/'public'))]={'type':mime+('' if binary else '; charset=utf-8'),'binary':binary,'data':base64.b64encode(raw).decode() if binary else raw.decode(),'etag':'"'+hashlib.sha256(raw).hexdigest()[:24]+'"'}
service=(root/'worker/service.mjs').read_text().replace('export const isAdmin','const isAdmin').replace('export async function','async function')
entry=service+'\nconst assets='+json.dumps(assets,ensure_ascii=False,separators=(',',':'))+';\nexport default {fetch(request,env){return handle(request,env,assets)}};\n'
(out/'server/index.js').write_text(entry)
shutil.copytree(root/'drizzle',out/'drizzle',dirs_exist_ok=True)
if (root/'.openai'/'hosting.json').is_file():
 shutil.copytree(root/'.openai',out/'.openai',dirs_exist_ok=True)
(out/'server/wrangler.json').write_text(json.dumps({'name':'valometra-estimation','main':'index.js','compatibility_date':'2025-09-15','d1_databases':[{'binding':'DB','database_name':'valometra-leads','migrations_dir':'../drizzle'}]},indent=2))
print('Build:',len(assets),'assets,',len(entry.encode()),'octets Worker')
