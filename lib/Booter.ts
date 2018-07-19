import "reflect-metadata";
import {DAO} from "@gota/dao";

const DESIGN_META_DATA = {
    APP : 'design:meta:data:key:app',
    CONFIG : 'design:meta:data:key:config',
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

interface ParameterWrapper{
    designMetaData: string,//Query, Path, Body
    name: string,
    type: any,
    value?:any
}

interface FunctionWrapper{
    function: Function;
    requestMethod: string | Array<string>
    path: string | Array<string>
    parameterWrappers: Array<ParameterWrapper>;
    returnType: any;
    awaitedType?: any;
}

interface ServiceWrapper{
    service: any;
    path: string | Array<string>;
    functionWrappers: Array<FunctionWrapper>;
}

interface ServiceInformation{
    requestMethod:string;
    path:string;
    returnType: Function;
    awaitedType?: Function;
    requestInformation: Array<ParameterWrapper>;
    service: Object;
    function: Function;
}

export default class Booter {
    private static buildServiceWrapper(service: any): ServiceWrapper {
        let serviceClass = service.constructor;
        let serviceMetaData = Reflect.getMetadata(DESIGN_META_DATA.SERVICE, serviceClass);
        let functionWrappers = this.buildMethodWrappers(service);
        let serviceWrapper: ServiceWrapper = {
            service: service,
            path: serviceMetaData.path,
            functionWrappers: functionWrappers
        };
        return serviceWrapper;
    }

    private static buildMethodWrappers(service: any): Array<FunctionWrapper>{
        let methodWrappers: Array<FunctionWrapper> = [];
        methodWrappers = Object.getOwnPropertyNames(service.constructor.prototype).filter(function (property) {
            return typeof service[property] === 'function' && service[property].toString().indexOf('class')!==0;
        }).map(methodName=> {
                return this.buildMethodWrapper(service, methodName);
        }).filter(methodWrapper => methodWrapper);
        return methodWrappers;
    }

    private static buildMethodWrapper(service: any, methodName:string): FunctionWrapper{
        let methodMetaData = Reflect.getMetadata(DESIGN_META_DATA.SERVICE_MAPPING, service, methodName);
        if(methodMetaData){
            let _function: Function = service[methodName];
            let parameterWrappers: Array<ParameterWrapper> = this.buildParameterWrappers(service, methodName);

            let functionWrapper: FunctionWrapper;
            functionWrapper = {
                function: _function,
                requestMethod: methodMetaData.requestMethod || REQUEST_METHOD.GET,
                path: methodMetaData.path,
                returnType:methodMetaData.returnType,
                awaitedType: methodMetaData.awaitedType,
                parameterWrappers: parameterWrappers
            }
            return functionWrapper;
        }else{
            return undefined;
        }

    }

    private static buildParameterWrappers(service: any, methodName:string): Array<ParameterWrapper>{
        let parameterWrappers: Array<ParameterWrapper> =[];
        let parameterMetaData = Reflect.getMetadata(DESIGN_META_DATA.PARAMETER, service,  methodName);
        if(Array.isArray(parameterMetaData)) {
            parameterMetaData.forEach(parameterItem=>{
                let parameterWrapper: ParameterWrapper = {
                    designMetaData: parameterItem.designMetaData,
                    name: parameterItem.name,
                    type: parameterItem.type
                }
                parameterWrappers.push(parameterWrapper)
            });
        }
        return parameterWrappers;
    }

    private static getArguments(request: any, response: any, parameterWrappers: Array<ParameterWrapper>,): Array<any> {
        let _arguments:Array<any> = []
        if (Array.isArray(parameterWrappers) && parameterWrappers.length > 0) {
            parameterWrappers.forEach(parameterWrapper => {
                let designMetaData = parameterWrapper.designMetaData;
                let parameterName = parameterWrapper.name;
                switch (designMetaData) {
                    case DESIGN_META_DATA.PATH_PARAMETER:
                        _arguments.push(request.params[parameterName]);
                        break;
                    case DESIGN_META_DATA.QUERY:
                        _arguments.push(request.query);
                        break;
                    case DESIGN_META_DATA.QUERY_PARAMETER:
                        _arguments.push(request.query[parameterName]);
                        break;
                    case DESIGN_META_DATA.BODY:
                        _arguments.push(request.body);
                        break;
                    case DESIGN_META_DATA.BODY_PARAMETER:
                        _arguments.push(request.body[parameterName]);
                        break;
                    case DESIGN_META_DATA.HEADERS:
                        _arguments.push(request.headers);
                        break;
                    case DESIGN_META_DATA.HEADERS_PARAMETER:
                        let argLowerCase = parameterName.replace(/[A-Z]/g, (match, offset, string) => {
                            return (offset ? '-' : '') + match.toLowerCase();
                        });
                        _arguments.push(request.headers[parameterName] || request.headers[argLowerCase]);
                        break;
                    case DESIGN_META_DATA.REQUEST:
                        _arguments.push(request);
                        break;
                    case DESIGN_META_DATA.RESPONSE:
                        _arguments.push(response);
                    default:
                        break;
                }
            });
        }
        return _arguments;
    }

    private static collectServiceInformation(serviceWrapper: ServiceWrapper): Array<ServiceInformation>{
        let serviceInformationList: Array<ServiceInformation> = [];

        let servicePaths = serviceWrapper.path;
        if(typeof servicePaths === 'string'){
            servicePaths = [servicePaths.toString()];
        }
        let functionWrappers = serviceWrapper.functionWrappers;
        servicePaths.forEach(servicePath => {
            functionWrappers.forEach(functionWrapper => {
                let requestMethods = functionWrapper.requestMethod;
                if(typeof requestMethods === 'string'){
                    requestMethods = [requestMethods.toString()];
                }
                requestMethods.forEach(requestMethod=>{
                    let functionPaths = functionWrapper.path;
                    if(typeof functionPaths === 'string'){
                        functionPaths = [functionPaths.toString()];
                    }
                    functionPaths.forEach(functionPath =>{
                        let path = servicePath + functionPath;
                        let serviceInformation: ServiceInformation = {
                            path:path,
                            requestMethod:requestMethod,
                            service: serviceWrapper.service,
                            function: functionWrapper.function,
                            returnType: functionWrapper.returnType,
                            awaitedType: functionWrapper.awaitedType,
                            requestInformation: functionWrapper.parameterWrappers
                        }
                        serviceInformationList.push(serviceInformation)
                    })
                })
            });
        })
        return serviceInformationList;
    }

    private static bootAcollectionServiceItem(server: any, serviceInformation: ServiceInformation):void{
        let app = server;
        let path: string = serviceInformation.path;
        let requestMethod: string = serviceInformation.requestMethod ;
        let _function = serviceInformation.function;
        let service = serviceInformation.service;
        app.addMapping(path, requestMethod, serviceInformation.requestInformation, _function, service)
    }

    private static bootCollectionService(server: any, collectionService: Array<ServiceInformation>):void{
        collectionService.forEach(serviceInformation => {
            let config : any = Reflect.getMetadata(DESIGN_META_DATA.CONFIG, serviceInformation.service.constructor);
            // if(config.devMode){
            //     console.log('Apply method "%s" for url: "%s"', serviceInformation.requestMethod, serviceInformation.path);
            // }
            this.bootAcollectionServiceItem(server, serviceInformation);
        })
    }


    /////////////////////////////
    private static collectOptionsServiceInformation(serviceInformationList: Array<ServiceInformation>): any{
        let urls = serviceInformationList
            .map(item => item.path)
            .filter((item, pos, self) => self.indexOf(item) == pos);

        let collectionOptionService = {};
        urls.forEach(url => {
            let collectionOptionServiceItem = collectionOptionService[url] || {};
            let sameUrlServiceInformation = serviceInformationList.filter(item => item.path===url);
            sameUrlServiceInformation.forEach(serviceInformation =>{
                collectionOptionServiceItem[serviceInformation.requestMethod] = {
                    service: serviceInformation.service,
                    function: serviceInformation.function,
                    returnType: serviceInformation.returnType,
                    awaitedType: serviceInformation.awaitedType,
                    requestInformation: serviceInformation.requestInformation
                }
            });
            collectionOptionService[url] = collectionOptionServiceItem;
        });

        return collectionOptionService;
    }

    private static buildAOptionSummary(url:string, object:any){
        let returnObject = {url:url};
        Object.keys(object).forEach(key =>{
            let responseType:any = object[key]['awaitedType'] || object[key]['returnType'] || 'String';
            let requestData:{path?: object[], headers?: object[], query?: object[], body?: any[]} = {};
            object[key]['requestInformation'].forEach(item => {
                switch (item.designMetaData){
                    case DESIGN_META_DATA.PATH_PARAMETER:
                        requestData.path = requestData.path || [];
                        requestData.path.push({name: item.name, type:item.type.name});
                        break;
                    case DESIGN_META_DATA.HEADERS_PARAMETER:
                        requestData.headers = requestData.headers || [];
                        requestData.headers.push({name: item.name, type:item.type.name});
                        break;
                    case DESIGN_META_DATA.QUERY_PARAMETER:
                        requestData.query = requestData.query || [];
                        requestData.query.push({name: item.name, type:item.type.name});
                        break;
                    case DESIGN_META_DATA.BODY_PARAMETER:
                        requestData.body = requestData.body || [];
                        requestData.body.push({name: item.name, type:item.type.name});
                        break;
                }
            });
            returnObject[key] =
                {
                    requestData:requestData,
                    responseType: responseType.name || responseType
                }
        });
        return returnObject;
    }
    private static bootSummaryService(server: any,path:string | string[],  optionServiceInformationList:any):void{
        let summary =[];
        Object.keys(optionServiceInformationList).forEach(key =>{
            summary.push(Booter.buildAOptionSummary(key,optionServiceInformationList[key]));
        });

        summary.forEach(s=>{
            server.addMapping(s.url, REQUEST_METHOD.OPTIONS, [],() => s, null);
        })



    }

    /////////////////////////////

    public static bootService(server: any, service: any) {
        let serviceWrapper: ServiceWrapper = Booter.buildServiceWrapper(service);
        let serviceInformationList: Array<ServiceInformation> = Booter.collectServiceInformation(serviceWrapper);
        let optionServiceInformationList = Booter.collectOptionsServiceInformation(serviceInformationList);
        Booter.bootCollectionService(server, serviceInformationList);
        Booter.bootSummaryService(server, serviceWrapper.path, optionServiceInformationList);

    }

    public static bootModels(server: any, servicePath: string, models: any[]) {
        models.forEach(model =>{
            Booter.bootAModel(server, servicePath, model);
        });

    }

    private static bootAModel(server: any, servicePath: string, model: any) {
        let dao = new DAO(model);
        dao.initCollection();
        let modelPath = model.name.replace(/[A-Z]/g, (match, offset, string)=> {
            return (offset ? '-' : '') + match.toLowerCase();
        });

        let bodyParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.BODY,
            name: 'body',
            type: Object
        }

        let idPathParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.PATH_PARAMETER,
            name: 'id',
            type: String
        }

        let queryParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.QUERY,
            name: 'query',
            type: Object
        }

    let unUnitName = function (str: string): string{
        var re = new RegExp(/./g)
        str = str.toLowerCase();
        str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'|\"|\&|\#|\[|\]|~|\$|_|`|-|{|}|\||\\/g," ");
        str = str.replace(/a|à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,'(a|à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ)');
        str = str.replace(/e|è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,'(e|è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ)');
        str = str.replace(/i|ì|í|ị|ỉ|ĩ/g,'(i|ì|í|ị|ỉ|ĩ)');
        str = str.replace(/o|ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,'(o|ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ)');
        str = str.replace(/u|ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,'(u|ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ)');
        str = str.replace(/y|ỳ|ý|ỵ|ỷ|ỹ/g,'(y|ỳ|ý|ỵ|ỷ|ỹ)');
        str = str.replace(/d|đ/g,'(d|đ)');

        str = str.trim();
        str = str.replace(/ +/g,"(.*)");
        return str;
        }

        let executes = {
            search: async function (query){
                Object.keys(query).forEach(key => {
                    if(query[key].startsWith('$regex:')){
                        let regexValue = query[key].substring('$regex:'.length).trim();
                        regexValue = unUnitName(regexValue);
                        query[key] = {
                            $regex:new RegExp(regexValue, 'i')
                        }
                    }
                });
                let t = await dao.search(query);
                return t;
            },
            read: async function (id){
                let t = await dao.read(id);
                return t;
            },
            create: async function (body){
                // let _id, result;
                // if(query && Object.keys(query).find(key => query[key] == '$')){
                //     result = await dao.createChild(query, body);
                // }else {
                    let _id = await dao.create(body);
                //}

                return {_id: _id};
            },
            createChild:  async function (id, query, body){
                let result;
                if(query && Object.keys(query).find(key => query[key] == '$')) {
                    let childProperty = Object.keys(query).find(key => query[key] == '$')
                    result = await dao.createChild(id, childProperty, body);
                }
                return {result: result};
            },
            update: async function (id, query, body){
                let result;
                if(query && Object.keys(query).find(key => query[key] == '$')) {
                    let childProperty = Object.keys(query).find(key => query[key] == '$');
                    let childQuery = Object.assign(query);
                    childQuery[childProperty] = undefined;
                    result = await dao.updateChild(id, childProperty, childQuery, body);
                }else{
                    result = await dao.update(id, body);
                }

                return {result: result};
            },
            delete: async function (id, body){
                let result = await dao.delete(id);
                return {result: result};
            },
            options: ()=>{ return {ok:1}},
            updateMany: async function (query, body){
                let result = await dao.updateMany(query, body);
                return {result: result};
            },
        };

        server.addMapping(`${servicePath}/${modelPath}`,  REQUEST_METHOD.OPTIONS, [], executes.options);
        server.addMapping(`${servicePath}/${modelPath}`,  REQUEST_METHOD.GET, [queryParameter],  executes.search);
        server.addMapping(`${servicePath}/${modelPath}`,  REQUEST_METHOD.POST, [bodyParameter], executes.create);

        //update many
        server.addMapping(`${servicePath}/${modelPath}`,  REQUEST_METHOD.PATCH, [queryParameter, bodyParameter], executes.updateMany);

        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.OPTIONS, [], executes.options);
        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.GET, [idPathParameter], executes.read);
        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.POST, [idPathParameter, queryParameter, bodyParameter], executes.createChild);
        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.PUT, [idPathParameter, queryParameter, bodyParameter], executes.update);
        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.PATCH, [idPathParameter, queryParameter, bodyParameter], executes.update);
        server.addMapping(`${servicePath}/${modelPath}/:id`,  REQUEST_METHOD.DELETE, [idPathParameter], executes.delete);

    }

}
