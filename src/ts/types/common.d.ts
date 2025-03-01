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
}