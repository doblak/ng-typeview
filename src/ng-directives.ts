import {List} from "immutable";
import {Maybe} from "monet";
import * as P from "parsimmon"

import {filterExpressionToTypescript, parseNgFilterExpression,
        NgFilterExpression, ngFilterExpressionToTypeScriptStandalone,
        ngFilterExpressionToTypeScriptEmbedded, keyword, parseAtom,
        CodegenHelper
       } from "./view-ngexpression-parser"

/**
 * When handling an angular directive, you can generate TS source code for
 * type-safety testing. This is what your directive can return to ng-typeview.
 */
export interface DirectiveResponse {
    /**
     * The code you want to insert in the generated typescript
     */
    source: string;
    /**
     * An optional function returning the code that'll be inserted
     * when this tag gets closed (typically you'll give nothing,
     * or `}` or `})` for instance).
     */
    closeSource?: ()=>string;
};

/**
 * Allows to handle a specific angular directive, which is tied to an attribute
 * (so, not tied to any particular HTML tag). For instance `<ANY ng-repeat>`.
 */
export interface AttributeDirectiveHandler {
    /**
     * List of attribute names which will trigger this handler. You must
     * use the ng-xxx syntax here (other forms present in your application's
     * source will get normalized to this syntax, so it'll match).
     */
    forAttributes: string[];
    /**
     * handle a certain attribute appearing in the view.
     * @param attrName The normalized name of the attribute (always in the form ng-xxx)
     * @param attrValue The value for the attribute
     * @param codegenHelpers Object containing helper functions
     *     to assist with typescript code generation
     * @returns The TS source to generate for that attribute, and the closing source if needed.
     *     You can also return `undefined` in case you don't want to handle the attribute.
     */
    handleAttribute(
        attrName: string, attrValue: string,
        codegenHelpers: CodegenHelper): DirectiveResponse|undefined;
}

/**
 * Allows to handle a specific angular directive, which tied to a specific
 * HTML tag. For instance `ui-select`.
 */
export interface TagDirectiveHandler {
    /**
     * List of tag names which will trigger this handler. You must use the
     * ng-xxx syntax here (other forms present in your application's source
     * will get normalized to this syntax, so it'll match).
     * NOTE: If you return the empty list here, you will be called for every tag.
     */
    forTags: string[];
    /**
     * handle a certain tag appearing in the view.
     * @param tagName The normalized name of the tag (always in the form ng-xxx)
     * @param attribs A dictionary object, the keys being the normalized (ng-xxx)
     *     attribute names, the value the attribute values
     * @param codegenHelpers Object containing helper functions
     *     to assist with typescript code generation
     * @returns The TS source to generate for that attribute, and the closing source if needed.
     *     You can also return `undefined` in case you don't want to handle the tag.
     */
    handleTag(
        tagName: string, attribs:{[type:string]: string},
        codegenHelpers: CodegenHelper): DirectiveResponse|undefined;
}

const boolAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-required", "ng-disabled"],
    handleAttribute: (attrName, val, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("boolean", val) })
};

// ng-show and ng-if introduce a scope. The reason is flow-control in typescript:
// if (variable.kind === ...) { /* typescript now knows the kind is X */ }
const boolWithScopeAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-show", "ng-if"],
    handleAttribute: (attrName, val, codegenHelpers) =>
        ({
            source: codegenHelpers.declareVariable("boolean", val) +
                `if (${codegenHelpers.addScopeAccessors(val)}) {`,
            closeSource: () => "}"
        })
};

const anyAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-click", "ng-model", "ng-change", "ng-value",
                    "ng-submit", "ng-class", "ng-style"],
    handleAttribute: (attrName, val, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("any", val) })
};

const stringAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-include", "ng-src"],
    handleAttribute: (attrName, val, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("string", val) })
};

const numberAttrHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-maxlength"],
    handleAttribute: (attrName, val, codegenHelpers) =>
        ({ source: codegenHelpers.declareVariable("number", val) })
};

const ngBindAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-bind", "ng-bind-html"],
    handleAttribute: (attrName, attrValue, codegenHelpers) =>
        {
            return {source: filterExpressionToTypescript(attrValue, codegenHelpers)};
        }
};

interface NgRepeatData {
    readonly variable: string;
    readonly expression: NgFilterExpression;
    readonly trackingExpression?: string;
}

function parseNgRepeat(): P.Parser<NgRepeatData> {
    return parseAtom()
        .chain(variable => keyword("in")
               .then(parseNgFilterExpression())
               .chain(expression => parseNgOptionsTrackBy().atMost(1)
                      .map(trackBy => {
                          const r: NgRepeatData = {
                              variable, expression,
                              trackingExpression: trackBy ? trackBy[0] : undefined
                          };
                          return r;
                      })))
}

const ngRepeatAttrDirectiveHandler: AttributeDirectiveHandler = {
    forAttributes: ["ng-repeat"],
    handleAttribute: (attrName, attrValue, codegenHelpers) =>
        {
            const ngRepeatData = parseNgRepeat().parse(attrValue);
            if (!ngRepeatData.status) {
                console.warn("failed parsing a ng-repeat clause!");
                console.warn(attrValue);
                console.warn(ngRepeatData);
                return {source: ""};
            }
            const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                ngRepeatData.value.expression, codegenHelpers);
            const source =`angular.forEach(${enumerable}, ${
                codegenHelpers.registerVariable(ngRepeatData.value.variable)} => {` +
                `let ${codegenHelpers.registerVariable('$index')} = 0;` +
                `let ${codegenHelpers.registerVariable('$first')} = true;` +
                `let ${codegenHelpers.registerVariable('$middle')} = true;` +
                `let ${codegenHelpers.registerVariable('$last')} = true;` +
                `let ${codegenHelpers.registerVariable('$even')} = true;` +
                `let ${codegenHelpers.registerVariable('$odd')} = false;` +
                (ngRepeatData.value.trackingExpression ?
                 `${codegenHelpers.declareVariable('any', ngRepeatData.value.trackingExpression)}` : "");
            return {
                source,
                closeSource: () => "});"
            };
        }
};

// https://docs.angularjs.org/api/ng/directive/ngOptions
interface NgOptionsData {
    readonly select?: NgFilterExpression;
    readonly label: NgFilterExpression;
    readonly value: string;
    readonly array: NgFilterExpression;
    readonly trackexpr?: string;
}

function parseNgOptions(): P.Parser<NgOptionsData> {
    return parseNgFilterExpression()
        .chain(first => parseNgOptionsAs(first).or(parseNgOptionsFor({ label: first})));
}

function parseNgOptionsAs(select: NgFilterExpression): P.Parser<NgOptionsData> {
    return keyword("as")
        .then(parseNgFilterExpression())
        .chain(label => parseNgOptionsFor({select, label}));
}

function parseNgOptionsFor(expressions: {label:NgFilterExpression,select?:NgFilterExpression}): P.Parser<NgOptionsData> {
    return keyword("for")
        .then(P.takeWhile(c => c !== ' ').skip(keyword("in")))
        .chain(value => parseNgFilterExpression()
               .chain(array => parseNgOptionsTrackBy().atMost(1)
                      .map(trackBy => {
                          const r: NgOptionsData = {
                              select: expressions.select,
                              label: expressions.label,
                              value: value,
                              array: array,
                              trackexpr: trackBy ? trackBy[0] : undefined
                          };
                          return r;
                      })));
}

function parseNgOptionsTrackBy(): P.Parser<string> {
    return P.regexp(/\s+track\s+by\s+/).then(P.all);
}

const ngOptions: AttributeDirectiveHandler = {
    forAttributes: ["ng-options"],
    handleAttribute: (attrName, attrValue, codegenHelpers) =>
        {
            const ngOptionsData = parseNgOptions().parse(attrValue);
            if (!ngOptionsData.status) {
                console.warn("failed parsing a ng-options clause!");
                console.warn(attrValue);
                console.warn(ngOptionsData);
                return {source: ""};
            }
            const addVar = (v:string|undefined) => (v ? `${codegenHelpers.declareVariable('any', v)}` : "");
            const addNgVar = (v:NgFilterExpression|undefined) =>
                (v ? ngFilterExpressionToTypeScriptStandalone(v, codegenHelpers) : "");
            const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                ngOptionsData.value.array, codegenHelpers);
            const source = `angular.forEach(${enumerable}, ${codegenHelpers.registerVariable(ngOptionsData.value.value)} => {` +
                addNgVar(ngOptionsData.value.select) +
                addNgVar(ngOptionsData.value.label) +
                addVar(ngOptionsData.value.trackexpr) +
                "});";
            return {source};
        }
};

// ng-switch should work on the attribute level, but the spec requires to read
// multiple attributes at once... Eg "on"
const ngSwitch: TagDirectiveHandler = {
    forTags: [],
    handleTag: (tag, attribs, codegenHelpers) =>
        {
            if (!attribs.hasOwnProperty('ng-switch')) { return; }
            const expr = attribs.hasOwnProperty('on') ?
                attribs['on'] : attribs['ng-switch'];
            return {
                source: `switch (${codegenHelpers.addScopeAccessors(expr)}) {`,
                closeSource: () => "}"
            };
        }
};

// ng-switch-when should work on the attribute level, but the spec requires to read
// multiple attributes at once... Eg "ng-switch-when-separator"
const ngSwitchWhen: TagDirectiveHandler = {
    forTags: [],
    handleTag: (tag, attribs, codegenHelpers) =>
        {
            if (!attribs.hasOwnProperty("ng-switch-when")) { return; }
            if (attribs.hasOwnProperty("ng-switch-when-separator")) {
                const values = attribs['ng-switch-when'].split(attribs['ng-switch-when-separator']);
                const source = values.map(codegenHelpers.addScopeAccessors).map(v => `case ${v}: break;`).join("");
                return {source};
            } else {
                return {source: `case ${codegenHelpers.addScopeAccessors(attribs['ng-switch-when'])}: break;`};
            }
        }
};

const ngUiSelectDirectiveTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select"],
    handleTag: (tag, attribs, codegenHelpers) => {
        // a while just to introduce a new scope.
        let source = "while (1) {";
        for (let attrName in attribs){
            const attrValue = attribs[attrName];
            switch (attrName) {
            case "ng-model":
                source += `let ${codegenHelpers.registerVariable("$select")} = {search:'', selected: ${
                    codegenHelpers.addScopeAccessors(attrValue)}};`;
                break;
            case "allow-clear":
                source += codegenHelpers.declareVariable("boolean", attrValue);
                break;
            case "ui-lock-choice":
                source += codegenHelpers.declareVariable("any", attrValue);
                break;
            }
        }
        return {source, closeSource: () => "}"};
    }
};

interface NgUiSelectChoicesData {
    readonly variable: string;
    readonly expression: NgFilterExpression;
}

function parseNgUiSelectChoicesSelect(): P.Parser<NgUiSelectChoicesData> {
    return parseAtom()
        .chain(variable => keyword("in")
               .then(parseNgFilterExpression())
               .map(expression => {
                   const r: NgUiSelectChoicesData = {
                       variable, expression
                   };
                   return r;
               }))
}

const ngUiSelectChoicesTagHandler: TagDirectiveHandler = {
    forTags: ["ui-select-choices"],
    handleTag: (tag, attribs, codegenHelpers) => {
        for (let attrName in attribs) {
            if (attrName === "repeat") {
                const attrValue = attribs[attrName];
                const selectData = parseNgUiSelectChoicesSelect().parse(attrValue);
                if (!selectData.status) {
                    console.warn("failed parsing a ui-select-choices select clause!");
                    console.warn(attrValue);
                    console.warn(selectData);
                    return {source: ""};
                }
                const enumerable = ngFilterExpressionToTypeScriptEmbedded(
                    selectData.value.expression, codegenHelpers);
                return {
                    source: `${enumerable}.forEach(${
                        codegenHelpers.registerVariable(selectData.value.variable)} => {`,
                    closeSource: () => "});"
                };
            }
        }
    }
};

/**
 * Set of angular attribute directives supported out of the box. You can give this
 * list in [[ProjectSettings.attributeDirectives]], or you can add your own or provide
 * your own list entirely.
 */
export const defaultAttrDirectiveHandlers =
    [boolAttrHandler, boolWithScopeAttrHandler,
     anyAttrHandler, stringAttrHandler, numberAttrHandler,
    ngBindAttrDirectiveHandler,
    ngRepeatAttrDirectiveHandler, ngOptions];

/**
 * Set of angular tag directives supported out of the box. You can give this
 * list in [[ProjectSettings.tagDirectives]], or you can add your own or provide
 * your own list entirely.
 */
export const defaultTagDirectiveHandlers =
    [ngUiSelectDirectiveTagHandler, ngUiSelectChoicesTagHandler,
    ngSwitch, ngSwitchWhen];
