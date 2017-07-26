/**
 * Created by cuikai on 2015/9/28.
 * • 根据prepare插件留下的字典信息，替换所有html里和js的js模块的require和require.async，替换依赖模块名

 */

var cheerio = require('cheerio'),
    utils = require("./libs/utils")
    ;
var fs = require('fs'),
    pth = require('path'),
    _exists = fs.existsSync || pth.existsSync;

var dependency = require("./libs/dependency.js");

var utilNode = require("util");
var codeRegex = require("./libs/codeRegex.js");



/**
 * 根据传入的原始依赖项，获取依赖模块名的最新信息(已经定义了别名的依赖项，使用别名)
 * @param moduleId
 * @returns {*}
 */
function getDependencyModuleId(moduleId){

    //查询别名表
    if(fis._ckdata.allAlias.hasOwnProperty(moduleId)){
        moduleId = moduleId;
    }else if(fis._ckdata.pathToAlias.hasOwnProperty(moduleId)){
        moduleId = fis._ckdata.pathToAlias[moduleId];
    }else{
        //没有别名，则查询模块信息表，有的话直接返回，否则报错
        if(!fis._ckdata.allModules.hasOwnProperty(moduleId)){
            throw new Error("getDependencyModuleId error:module ["+moduleId+'] not exist!')
        }
    }

    return moduleId;
}



/**
 * 重定向js模块里的require关系.在这个过程中构建js模块之间的依赖关系，更新到全局map
 * @param file
 * @param settings
 */
function updateRequireAndGetDepsInfo(file,settings){
    //console.log("updateRequire:"+file.id);
    //首先检查文件是html还是js
    if(file.isHtmlLike){
        //查找html里有无内嵌的脚本
        var $ = cheerio.load(file.getContent());

        //对于html文件，只需要修改内联js的require,外部的js文件会单独调用updateRequire来作为独立文件处理
        //这里要注意，一个html内部可能定义多个js模块
        dependency.updateInlineScriptsContentInHtml($, function (jsContent) {

            var _hostModuleId;
            //注意,html 内联js的模块id,要从脚本内部分析获得

            codeRegex.findAllDefines(jsContent, function (hostModuleId) {
                if(!_hostModuleId){
                    _hostModuleId = hostModuleId
                }else{
                    throw new Error('在文件:['+file.subpath+']的内联js中出现多次define 同一个module的情况！,请检查！')
                }
            });

            //对内嵌的脚本，进行require的模块名替换
            jsContent = codeRegex.replaceRequire(jsContent, function (moduleId) {
                moduleId = getDependencyModuleId(moduleId);
                //记录该模块依赖其他模块的信息
                fis._ckdata.allModules[_hostModuleId].deps.push(moduleId);

                return moduleId;
            });

            jsContent = codeRegex.replaceRequireAsync(jsContent,function(moduleId){
                moduleId = getDependencyModuleId(moduleId);

                //记录该模块 异步依赖其他模块的信息
                fis._ckdata.allModules[_hostModuleId].asyncUse.push(moduleId);

                return moduleId;
            })


            return jsContent; //返回的值会更新脚本内容
        });

        file.setContent($.html());//修改文件内容

        //var script =$('script[type="text/javascript"]');
        //for(var i=0,j=script.length;i<j;i++) {
        //    var _scriptItem = $(script[i]);
        //
        //}
        //file.setContent($.html());


    }else if(file.isJsLike){
        //对脚本，进行require的模块名替换
        var jsContent = file.getContent();

        //在resources-prepare 插件中，会为每个独立的js文件设置moduleId属性
        var hostModuleId = file.__moduleId__;
        var hostModuleIdAlia = file.__alia__;
        if(hostModuleId==undefined){
            throw new Error("file:["+file.subpath+"]has no __moduleId__ prepared! check resources-prepare plugin");
        }else{
            jsContent = codeRegex.replaceRequire(jsContent, function (moduleId) {
                moduleId = getDependencyModuleId(moduleId);
                //记录该模块依赖其他模块的信息
                fis._ckdata.allModules[hostModuleId].deps.push(moduleId);
                if(hostModuleIdAlia){
                    fis._ckdata.allModules[hostModuleIdAlia].deps.push(moduleId);//如果模块有别名，别名的信息也写入
                }
                return moduleId;
            });

            jsContent = codeRegex.replaceRequireAsync(jsContent,function(moduleId){
                moduleId = getDependencyModuleId(moduleId);
                //记录该模块依赖其他模块的信息
                fis._ckdata.allModules[hostModuleId].asyncUse.push(moduleId);
                if(hostModuleIdAlia){
                    fis._ckdata.allModules[hostModuleIdAlia].asyncUse.push(moduleId);//如果模块有别名，别名的信息也写入
                }
                return moduleId;
            })
            file.setContent(jsContent);
        }

    }else{
        throw new Error("file must be htmlLike or jsLike!:"+file.subpath);
    }
}

module.exports = function (ret, conf, settings, opt) {

    console.log("别名<->模块字典:\r\n"+ utilNode.inspect(fis._ckdata.allAlias));
    console.log("模块字典:\r\n"+ utilNode.inspect(fis._ckdata.allModules));
    console.log("模块<->别名字典:\r\n"+ utilNode.inspect(fis._ckdata.pathToAlias));

    for(var subpath in ret.src) {
        var file = ret.src[subpath];
        console.log("resources-fix>>  file:"+file.subpath);

        // 对js资源进行预处理
        if (file.isJsLike || file.isHtmlLike) {
            if(file.needFix === false){

                console.log("resources-fix>>  needFix=false,无需 更新require引用 ");
                continue;
            }
            console.log("resources-fix>>   更新require引用 ");

            updateRequireAndGetDepsInfo(file,settings);
        }

    }
}