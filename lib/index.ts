import "reflect-metadata";
import Booter from "./Booter";
import { GotaServer, ServerFilter } from "@gota/server";

const DESIGN_META_DATA = {
    APP : 'design:meta:data:key:app',
    CONFIG : 'design:meta:data:key:config',
    POST_INIT : 'design:meta:data:key:post.init',
    AUTOWIRED : 'design:meta:data:key:autowired',
    SERVICE : 'design:meta:data:key:service',
    SERVICE_MAPPING : 'design:meta:data:key:service:mapping',
    PATH : 'design:meta:data:key:path',
    METHOD : 'design:meta:data:key:method',
    PARAMETER : 'design:meta:data:key:parameter',
    PATH_PARAMETER : 'design:meta:data:key:path:parameter',
    REQUEST : 'design:meta:data:key:request',
    RESPONSE : 'design:meta:data:key:response',
    QUERY : 'design:meta:data:key:query',
    QUERY_PARAMETER : 'design:meta:data:key:query:parameter',
    BODY : 'design:meta:data:key:body',
    BODY_PARAMETER : 'design:meta:data:key:body:parameter',
    HEADERS : 'design:meta:data:key:headers',
    HEADERS_PARAMETER : 'design:meta:data:key:headers:parameter'
};

const REQUEST_METHOD = {
    OPTIONS: 'OPTIONS',
    GET :'GET',
    POST :'POST',//CREATE
    PUT :'PUT',// REPLACE
    PATCH : 'PATCH',// UPDATE
    DELETE : 'DELETE'
};

export function GotaApp(obj: {name?: string,
    scanner:Array<Function>,
    config:object,
    filters?: Array<new() => ServerFilter>
}) {
    return Reflect.metadata(DESIGN_META_DATA.APP, obj);
}


function initApp(){
    let app = new GotaServer();
    return app;
}

function initConfig(classes: Array<any>, config: object): Array<any>{
    let targets = [];
    classes.forEach(serviceClass => {
        let metaData = Reflect.getMetadata(DESIGN_META_DATA.SERVICE, serviceClass);
        let newConfig = Object.assign({},config, metaData? metaData.config: undefined);
        Reflect.defineMetadata(DESIGN_META_DATA.CONFIG, newConfig, serviceClass);

        let target = new serviceClass();
        // init config for properties child class
        let autowiredProperties:  Array<string> = Reflect.getMetadata(DESIGN_META_DATA.AUTOWIRED, target);
        if(autowiredProperties){
            let propertiesClass = autowiredProperties.map(property => {
                return Reflect.getMetadata("design:typeinfo", target, property).type();
            });
            initConfig(propertiesClass, newConfig);
        }
        targets.push(target);
    });
    return targets;
}

function executeMethod(target: object, methods: string[]): Promise<any>{
    let promises: Promise<any>[] = [];
    methods.forEach(method =>{
        promises.push(Promise.resolve(target[method]()));
    });
    return Promise.all(promises);
}

async function executePostInit (serviceTargets : any){
    if(Array.isArray(serviceTargets)){
        for(let i = 0; i< (serviceTargets as Array<any>).length; i++){
            let serviceTarget = (serviceTargets as Array<any>)[i];
            await executePostInit(serviceTarget);
        }
    }else{
        let serviceTarget: any = serviceTargets;
        let autowiredProperties= Reflect.getMetadata(DESIGN_META_DATA.AUTOWIRED, serviceTarget) || [];
        for(let i =0; i< autowiredProperties.length; i++) {
            let property = autowiredProperties[i];
            await executePostInit(serviceTarget[property]);
        }
        let postInitMethods: Array<Object> = Reflect.getMetadata(DESIGN_META_DATA.POST_INIT, serviceTarget) || [];
        await executeMethod(serviceTarget, postInitMethods as string[]);
    }

}


export async function GotaBoot(appClass: Function) {
    let gotaAppMetadata  = Reflect.getMetadata(DESIGN_META_DATA.APP, appClass);
    let serviceClasses: Array<Function> = gotaAppMetadata.scanner;
    let filterClasses: Array<new() => ServerFilter> = gotaAppMetadata.filters;
    let config = gotaAppMetadata.config;
    if(!serviceClasses){
        throw new Error('Please make sure "scanner" in "@GotaApp" Metadata of "'+appClass.name+'" is not empty.');
    }
    let app = initApp();
    if(filterClasses){
        app.addFilters(filterClasses.map(filterClass => new filterClass()));
    }

    //console.log(`${gotaAppMetadata.name || appClass.name} is starting at ${config.hostName}:${config.port}`);
    let serviceTargets = initConfig(serviceClasses, config);
    await executePostInit(serviceTargets);

    serviceTargets.forEach(serviceTarget => {

        let serviceMetaData = Reflect.getMetadata(DESIGN_META_DATA.SERVICE, serviceTarget.constructor);
        //let models = serviceMetaData.models;
        // Booter.bootModels(app, serviceMetaData.path, models);
        if(serviceMetaData){
            Booter.bootService(app, serviceTarget);
        }

    });

	app.listen(config.port, config.hostName,function () {
	    console.log(`${gotaAppMetadata.name || appClass.name} is listening at ${config.hostName}:${config.port}`);
    });
}