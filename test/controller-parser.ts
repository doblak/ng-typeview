import * as assert from 'assert'
import {Maybe} from "monet";
import {extractControllerScopeInfo, ControllerScopeInfo,
        extractCtrlViewConnsAngularModule,
        ControllerViewInfo, defaultCtrlViewConnectors} from '../src/controller-parser'
import * as ts from "typescript";

const ctrlViewConn = {
    interceptAstNode: ts.SyntaxKind.CallExpression,
    getControllerView: (node: ts.Node, projectPath: string): ControllerViewInfo[] => {
        const call = <ts.CallExpression>node;
        if (["displayDialog", "core.displayDialog"].indexOf(call.expression.getText()) < 0) {
            return [];
        }
        if (call.arguments.length < 3) {
            return [];
        }
        if (call.arguments[1].kind !== ts.SyntaxKind.StringLiteral ||
            call.arguments[2].kind !== ts.SyntaxKind.StringLiteral) {
            return [];
        }
        return [{
            controllerName: (<ts.StringLiteral>call.arguments[1]).text,
            viewPath: (<ts.StringLiteral>call.arguments[2]).text}];
    }
};

describe("extractModalOpenAngularModule", () => {
    it("should recognize the statements", async () => {
        const modalModuleInfo = await extractCtrlViewConnsAngularModule(
            "test/data/test-ctrl.ts", "webapp", defaultCtrlViewConnectors.concat([ctrlViewConn]));
        assert.equal("test/data/test-ctrl.ts", modalModuleInfo.fileName);
        assert.deepEqual(Maybe.Some("my.ng.module.name"), modalModuleInfo.ngModuleName);
        assert.deepEqual(Maybe.Some("ControllerName"), modalModuleInfo.controllerName);
        assert.deepEqual([
            {
                controllerName: "CtrlState1",
                viewPath: "app/view/url1.html"
            },
            {
                controllerName: "CtrlState2",
                viewPath: "app/view/url2.html"
            },
            {
                controllerName: "ControllerName",
                viewPath: "test-view.html"
            },
            {
                controllerName: "AnotherControllerName",
                viewPath: "path/to/another/view.html"
            },
            {
                controllerName: "YupYetAnotherCtrl",
                viewPath: "and/yet/another/view.html"
            }], modalModuleInfo.controllerViewInfos);
    });
});

describe("extractControllerScopeInfo", () => {
    it("should parse the scope info", async () => {
        const scopeInfo = await extractControllerScopeInfo("test/data/test-ctrl.ts");
        assert.equal("multipart.module.name", scopeInfo.tsModuleName.some());
        assert.equal("interface Scope extends ng.IScope {\n" +
                     "        showDiv?: string;\n" +
                     "        showText: (x:string)=>boolean;\n" +
                     "        data: {groups: any[], firstname: string}\n" +
                     "        triggerAction: boolean\n" +
                     "        user: string;\n" +
                     "        maxlength: number;\n" +
                     "        boolean1: boolean;\n" +
                     "        boolean2: boolean;\n" +
                     "        boolean3: boolean;\n" +
                     "    }", scopeInfo.scopeInfo.some());
        assert.deepEqual(["type STR = string;", "type INT = number;"], scopeInfo.typeAliases);
        assert.deepEqual(["import Aa = api.Aa;", "import Bb = api.Bb;"], scopeInfo.imports);
        assert.deepEqual(
            [
                "interface NotScope extends SomethingElse {\n        intField: number;\n    }",
                "interface NotScope2 extends NotScope {\n        f1: (x:string)=>boolean;\n    }",
                "class NotScopeClass {\n        field?: number;\n        constructor(public f2: number);\n    }"
            ],
            scopeInfo.nonExportedDeclarations);
    });
});
