let ready;
self.onmessage=async ({data})=>{try{if(data.type==='init'){ready=(async()=>{importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});const names=['point','lower','upper','lower50','upper50'];const texts=await Promise.all(names.map(name=>fetch(name==='point'?'model.py':'model-'+name+'.py').then(r=>{if(!r.ok)throw Error('Modèle indisponible');return r.text()})));const [config,intervals,intervals50]=await Promise.all(['preprocessing.json','intervals.json','intervals50.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('Paramètres indisponibles');return r.text()})));py.runPython('models = {}');for(let i=0;i<names.length;i++){py.globals.set('model_name',names[i]);py.globals.set('model_source',texts[i]);py.runPython("namespace = {}\nexec(model_source, namespace)\nmodels[model_name] = namespace['apply_catboost_model']\ndel namespace\ndel model_source")};py.globals.set('config_json',config);py.globals.set('interval_json',intervals);py.globals.set('interval50_json',intervals50);py.runPython(`
import json,math,struct
config=json.loads(config_json)
interval=json.loads(interval_json)
interval50=json.loads(interval50_json)
def estimate_payload(payload):
    d=json.loads(payload)
    cats=[]
    floats=[]
    for k in config['features']:
        v=d.get(k,'')
        if k in config['categorical_features']:
            s=str(v) if v is not None and str(v)!='' else config['missing_category']
            cats.append(s.encode('utf-8').decode('latin1'))
        else:
            number=float(v) if v is not None and str(v)!='' else config['numeric_medians'][k]
            floats.append(struct.unpack('f',struct.pack('f',number))[0])
    point=math.exp(models['point'](floats,cats))
    ranges={}
    for band,lo,hi,meta in [('80','lower','upper',interval),('50','lower50','upper50',interval50)]:
        lower,upper=sorted([models[lo](floats,cats),models[hi](floats,cats)])
        correction=meta['calibrationCorrection']
        ranges[band]=[math.exp(lower-correction),math.exp(upper+correction)]
    return json.dumps({'value':point,'intervals':ranges})
`);return py})();await ready;self.postMessage({type:'ready'})}else{const py=await ready;py.globals.set('payload',JSON.stringify(data.features));const result=JSON.parse(py.runPython('estimate_payload(payload)'));if(!Number.isFinite(result.value)||result.value<=0||Object.values(result.intervals).some(b=>!b.every(v=>Number.isFinite(v)&&v>0)||b[0]>b[1]))throw Error('Résultat invalide');self.postMessage({type:'prediction',...result,id:data.id})}}catch(e){self.postMessage({type:'error',message:e.message,id:data.id})}};
