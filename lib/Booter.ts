import "reflect-metadata";
import {Helper} from "@gota/core";
import {DAO, DynamicAccessMode, EntityContainer} from "@gota/dao";
import {RequestMethod} from "@gota/service";

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
    awaitedType?: any;
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
                returnType:methodMetaData.returnType(),
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
            //let config : any = Reflect.getMetadata(DESIGN_META_DATA.CONFIG, serviceInformation.service.constructor);
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
        let schema =[]
        Object.keys(object).forEach(requestMethod =>{
            let responseType:any = object[requestMethod]['awaitedType'] || object[requestMethod]['returnType'] || 'String';
            let requestData:{path?: any[], headers?: any[], query?: any[], body?: any[]} = {};
            object[requestMethod]['requestInformation'].forEach(parameterWrapper => {

                let parameterColection:Array<{name:string, type: String}>;
                let declaredProperties:Array<{name:string, type: Function, dynamicAccessMode?:Array<String>}>;

                if([DESIGN_META_DATA.HEADERS, DESIGN_META_DATA.QUERY, DESIGN_META_DATA.BODY].includes(parameterWrapper.designMetaData)){
                    declaredProperties = Helper.findDeclaredProperties(parameterWrapper.type);
                    //Filter for Dynamic Access
                    if([RequestMethod.POST, RequestMethod.PUT].includes(requestMethod)){
                        declaredProperties = declaredProperties.filter(declaredProperty => {
                            return !declaredProperty.dynamicAccessMode || (declaredProperty.dynamicAccessMode as Array<String>).includes(DynamicAccessMode.WRITE);
                        });
                    }else if(requestMethod === RequestMethod.GET){
                        declaredProperties = declaredProperties.filter(declaredProperty => {
                            return !declaredProperty.dynamicAccessMode || (declaredProperty.dynamicAccessMode as Array<String>).includes(DynamicAccessMode.READ);
                        });
                    }
                }else{
                    declaredProperties = [{name: parameterWrapper.name, type:parameterWrapper.type}];
                }
                switch (parameterWrapper.designMetaData){
                    case DESIGN_META_DATA.PATH_PARAMETER:
                        parameterColection = requestData.path = requestData.path || [];
                        break;
                    case DESIGN_META_DATA.HEADERS:
                    case DESIGN_META_DATA.HEADERS_PARAMETER:
                        parameterColection = requestData.headers = requestData.headers || [];
                        break;
                    case DESIGN_META_DATA.QUERY:
                    case DESIGN_META_DATA.QUERY_PARAMETER:
                        parameterColection = requestData.query = requestData.query || [];
                        break;
                    case DESIGN_META_DATA.BODY:
                    case DESIGN_META_DATA.BODY_PARAMETER:
                        requestData.body = requestData.body || [];
                        parameterColection = requestData.body;
                        break;
                }

                declaredProperties.forEach(property => {
                    let sameProperty = parameterColection.find(p => p.name === property.name);
                    if(!sameProperty){
                        parameterColection.push({name: property.name, type:property.type.name});
                    }
                });

                if(typeof parameterWrapper.type === 'function'){
                    let childSchema = Helper.collectSchema(parameterWrapper.type);
                    if(childSchema.length>0){
                        schema.push(...childSchema);
                    }
                }
            });

            let returnSchema = [];
            if(typeof responseType === 'function'){
                returnSchema = Helper.collectSchema(responseType);
            } else if(typeof responseType === 'string'){
                if(responseType.indexOf('<')>-1 && responseType.indexOf('>')>-1){
                    let genericTypeName = responseType.substring(responseType.indexOf('<')+1, responseType.indexOf('>'));
                    if(genericTypeName.length>0){
                        let entity:Function = EntityContainer.findEntity(genericTypeName);
                        if(entity){
                            returnSchema = Helper.collectSchema(entity);
                        }
                    }
                }
            }
            schema.push(...returnSchema);
            returnObject[requestMethod] =
                {
                    requestData:requestData,
                    responseType: responseType.name || responseType
                }
        });
        

        returnObject['schema'] = schema.filter((schemaItem, index) => index === schema.findIndex(item => item.name ===schemaItem.name));
        return returnObject;
    }
    private static bootSummaryService(server: any,path:string | string[],  optionServiceInformationList:any):void{
        let summary =[];
        Object.keys(optionServiceInformationList).forEach(url =>{
            summary.push(Booter.buildAOptionSummary(url,optionServiceInformationList[url]));
        });

        summary.forEach(s=>{
            server.addMapping(s.url, REQUEST_METHOD.OPTIONS, [],() => s, null);
        })



    }

    /////////////////////////////

    public static bootService(server: any, service: any) {
        let serviceMetaData = Reflect.getMetadata(DESIGN_META_DATA.SERVICE, service.constructor);
        let models = serviceMetaData.models;
        let modelServiceInformationList:Array<ServiceInformation> = Booter.collectModelsServiceInformation(serviceMetaData.path, models);

        let serviceWrapper: ServiceWrapper = Booter.buildServiceWrapper(service);
        let serviceInformationList: Array<ServiceInformation> = Booter.collectServiceInformation(serviceWrapper);
        serviceInformationList.push(...modelServiceInformationList);

        let optionServiceInformationList = Booter.collectOptionsServiceInformation(serviceInformationList);

        Booter.bootCollectionService(server, serviceInformationList);
        Booter.bootSummaryService(server, serviceWrapper.path, optionServiceInformationList);

    }


    private static collectModelsServiceInformation(servicePath, models: any[] = []): Array<ServiceInformation>{
        let serviceInformation: Array<ServiceInformation> = []
        models.forEach(model =>{
            let service =Booter.collectAModelServiceInformation(servicePath, model);
                serviceInformation.push(...service);
        });
        return serviceInformation;

    }

    private static collectAModelServiceInformation(servicePath, model: any): Array<ServiceInformation> {
        let dao = new DAO(model);
        dao.initCollection();
        let modelPath = model.name.replace(/[A-Z]/g, (match, offset, string)=> {
            return (offset ? '-' : '') + match.toLowerCase();
        });

        let declaredProperties = Helper.findDeclaredProperties(model).filter(property => property.name !== '_id')

        let bodyParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.BODY,
            name: 'body',
            type: model
        }

        //let bodyParameters: ParameterWrapper[] = declaredProperties
        //    .map(item => {
        //            return {
        //                designMetaData: DESIGN_META_DATA.BODY_PARAMETER,
        //                name:item.name,
        //                type:item.type
        //            }
        //        }
        //    );

        let idPathParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.PATH_PARAMETER,
            name: 'id',
            type: String
        }

        let queryParameter:ParameterWrapper = {
            designMetaData: DESIGN_META_DATA.QUERY,
            name: 'query',
            type: model
        }

        let queryParameters: ParameterWrapper[] = declaredProperties
            .map(item =>{
                    return {
                        designMetaData: DESIGN_META_DATA.QUERY_PARAMETER,
                        name: item.name,
                        type: item.type
                    }
            }
            );



        let executes = {
            search: async function (query){
                function regexFormat(value){
                    if (value && typeof value.startsWith === 'function' &&  value.startsWith('$regex:')) {
                        let regexValue = value.substring('$regex:'.length).trim();
                        regexValue = Helper.searchVNStringRegexFormat(regexValue);
                        //value = {
                        //    $regex: new RegExp(regexValue, 'i')
                        //}

                        value = new RegExp(regexValue, 'i');
                    }
                    return value;
                }
                if(query) {
                    query =JSON.parse(JSON.stringify(query));
                    Object.keys(query).forEach(queryParam => {
                        let queryValue = query[queryParam];
                        if(Array.isArray(queryValue)){
                            queryValue = queryValue.map(val => regexFormat(val));
                        }else{
                            queryValue = regexFormat(queryValue);
                        }


                        query[queryParam] = queryValue;
                        let prefixSuffixAndPropertyItem: {prefix: String, suffix: String, property: String} = Helper.separatePrefixSuffixAndPropertyItem(queryParam);//$or:address.geographic.latitude$gte
                        let newQueryParam = prefixSuffixAndPropertyItem.property;//address.geographic.latitude
                        let prefix = prefixSuffixAndPropertyItem.prefix;// $or
                        let suffix = prefixSuffixAndPropertyItem.suffix;//$gte

                        if(newQueryParam !== queryParam){
                            delete(query[queryParam]);// = undefined;

                            let suffixObject;
                            if(suffix){
                                suffixObject = {};
                                suffixObject[suffix as string] = queryValue;//{$gte: 0.99}
                            }
                            let propertyObject;
                            propertyObject = {};
                            propertyObject[newQueryParam as string] = suffixObject || queryValue; //  { price : {$gte: 0.99} } || { price : 0.99 }
                            if(prefix){
                                query[prefix as string] =  query[prefix as string] || [];
                                query[prefix as string].push(propertyObject);
                            }else{
                                if(typeof query[newQueryParam as string] === 'object'){
                                    query[newQueryParam as string] = Object.assign(query[newQueryParam as string], propertyObject[newQueryParam as string]);
                                }else {
                                    query = Object.assign(query, propertyObject);
                                }

                            }
                        }

                    });
                }
                // query =JSON.parse(JSON.stringify(query));
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
                let _id;
                if(Array.isArray(body)){
                    _id = await dao.createMany(body);
                }else{
                    _id = await dao.create(body);
                }

                //}

                return {_id: _id};
            },

            update: async function (id, body){
                let result = await dao.update(id, body);
                return {result: result};
            },
            updateMany: async function (query, body){
                let result = await dao.updateMany(query, body);
                return {result: result};
            },

            delete: async function (id){
                let result = await dao.delete(id);
                return {result: result};
            },

            createChild:  async function (id, query, body){
                let result;
                if(query && Object.keys(query).find(key => query[key] == '$')) {
                    let childProperty = Object.keys(query).find(key => query[key] == '$')
                    result = await dao.createChild(id, childProperty, body);
                }
                return {result: result};
            },
            updateChild: async function (id, query, body){
                let result;// Todo
                if(query && Object.keys(query).find(key => query[key] == '$')) {
                    let childProperty = Object.keys(query).find(key => query[key] == '$');
                    let childQuery = Object.assign(query);
                    childQuery[childProperty] = undefined;
                    result = await dao.updateChild(id, childProperty, childQuery, body);
                }

                return {result: result};
            }

        };

        let search: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.GET,
            path:`${servicePath}/${modelPath}`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [queryParameter],
            service: null,
            function: executes.search
        }

        let create: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.POST,
            path:`${servicePath}/${modelPath}`,
            returnType: Promise,
            awaitedType: model.name,
            requestInformation: [bodyParameter],
            service: null,
            function: executes.create
        }

        let update: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.PATCH,
            path:`${servicePath}/${modelPath}/:id`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [idPathParameter, bodyParameter],
            service: null,
            function:executes.update
        }

        let updateMany: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.PATCH,
            path:`${servicePath}/${modelPath}`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [queryParameter, bodyParameter],
            service: null,
            function: executes.updateMany
        }

        let read: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.GET,
            path:`${servicePath}/${modelPath}/:id`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [idPathParameter],
            service: null,
            function: executes.read
        }

        let createChild: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.POST,
            path:`${servicePath}/${modelPath}/:id`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [idPathParameter, queryParameter, bodyParameter],
            service: null,
            function: executes.createChild
        }



        let updateChild: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.PATCH,
            path:`${servicePath}/${modelPath}/:id`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [idPathParameter, queryParameter, bodyParameter],
            service: null,
            function:executes.update
        }

        let _delete: ServiceInformation = {
            requestMethod:  REQUEST_METHOD.DELETE,
            path:`${servicePath}/${modelPath}/:id`,
            returnType: Promise,
            awaitedType: `Array<${model.name}>`,
            requestInformation: [idPathParameter],
            service: null,
            function:executes.delete
        }

        return [search, create, updateMany, read, createChild, update, _delete];
    }

}
