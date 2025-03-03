/// <reference path="../controllers/SearchController.ts" />

declare global {
    interface Window {
        Dataset: any;
    }
}


interface Window {
    Dataset: any;
    //
    
    SearchDatabase: any;
    SearchModel: any;
    SearchForm: any;
    SearchResultTable: any;    
    SearchView: any;
    SearchController: any;
    //

    Header: any;
    App: any;
    WASM_BASE64: string;

    // Add new Law-related types
    LawDatabase: any;
    LawModel: any;
    LawTable: any;
    LawView: any;
    LawController: any;

}