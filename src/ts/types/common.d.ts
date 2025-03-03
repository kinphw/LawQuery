/// <reference path="../controllers/SearchController.ts" />

declare global {
    interface Window {
        Dataset: any;
    }
}


interface Window {
    Dataset: any;
    Database: any;
    SearchModel: any;
    SearchForm: any;

    ResultTable: any;
    Header: any;
    MainView: any;
    SearchController: any;
    App: any;
    WASM_BASE64: string;

    // Add new Law-related types
    LawDatabase: any;
    LawModel: any;
    LawTable: any;
    LawView: any;
    LawController: any;

}