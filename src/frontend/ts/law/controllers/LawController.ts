// LawController.ts:
// 법령조회의 컨트롤러

import { IController } from "../../common/interfaces/IController";

import { LawDataManager } from "./data/LawDataManager";
// import { LawEventManager } from "./event/LawEventManager";
import { ILawEventManager } from "./event/ILawEventManager";
import { LawHeaderEventManager } from "./event/LawHeaderEventManager";
import { LawTextSizeEventManager } from "./event/LawTextSizeEventManager";
import { LawSearchEventManager } from "./event/LawSearchEventManager";
import { LawTextSearchEventManager } from "./event/LawTextSearchEventManager";
import { LawPenaltyEventManager } from "./event/penalty/LawPenaltyEventManager"; // 250504
import { LawReferenceEventManager } from "./event/reference/LawReferenceEventManager"; //250514

// import { LawModel } from "../models/LawModel";
import { LawFetchAllModel } from "../models/LawFetchAllModel";
import { LawFetchByIdModel } from "../models/LawFetchByIdModel";
import { LawFetchTitleModel } from "../models/LawFetchTitleModel"
import { LawTextFilterModel } from "../models/LawTextFilterModel";
import { LawFetchPenaltyModel } from "../models/LawFetchPenaltyModel";
import { LawFetchPenaltyIdsModel } from "../models/LawFetchPenaltyIdsModel";
import { LawFetchReferenceModel } from "../models/LawFetchReferenceModel";
import { LawFetchReferenceIdsModel } from "../models/LawFetchReferenceIdsModel";

import { LawView } from "../views/LawView";
import { LawPenaltyView } from "../views/components/LawPenaltyView";
// import { LawResult } from "../types/LawResult";

import { CurrentLawBox } from "../views/components/CurrentLawBox";

export interface ILawController extends IController {

    dataManager: LawDataManager;
    // eventManager: LawEventManager;

    // model: LawModel;
    modelFetchAll: LawFetchAllModel;
    modelFetchById: LawFetchByIdModel;
    modelFetchTitle: LawFetchTitleModel;
    modelTextFilter: LawTextFilterModel;
    modelFetchPenalty: LawFetchPenaltyModel; // 250504
    modelFetchPenaltyIds: LawFetchPenaltyIdsModel; // 250505

    modelFetchReference: LawFetchReferenceModel;           // 추가
    modelFetchReferenceIds: LawFetchReferenceIdsModel;     // 추가


    view: LawView;
    viewPenalty: LawPenaltyView; // 250504
    // currentResults: LawResult[]; // Store current results

    bindPostRenderEvents(): void; // 동적으로 생성된 버튼에만 이벤트를 바인딩하는 메서드
    bindAllEvents(): void; // 이벤트매니저에서 호출하기 위한 public 메서드

}

export class LawController implements ILawController {

    dataManager: LawDataManager;
    // eventManager: LawEventManager;

    // model!: LawModel;
    modelFetchAll!: LawFetchAllModel;
    modelFetchById!: LawFetchByIdModel;
    modelFetchTitle!: LawFetchTitleModel;
    modelTextFilter!: LawTextFilterModel;
    modelFetchPenalty!: LawFetchPenaltyModel; // 250504
    modelFetchPenaltyIds!: LawFetchPenaltyIdsModel; // 250505

    modelFetchReference!: LawFetchReferenceModel;           // 추가
    modelFetchReferenceIds!: LawFetchReferenceIdsModel;     // 추가



    view!: LawView;
    viewPenalty!: LawPenaltyView; // 250504
    // currentResults: LawResult[] = []; // Store current results
    private eventManagers: ILawEventManager[];
    private penaltyEventManager: LawPenaltyEventManager;
    private referenceEventManager: LawReferenceEventManager; // 250515

    constructor() {

        // 모델과 뷰 초기화
        // this.model = new LawModel(db);
        // this.model = new LawModel();

        this.modelFetchAll = new LawFetchAllModel();
        this.modelFetchById = new LawFetchByIdModel();
        this.modelFetchTitle = new LawFetchTitleModel();
        this.modelTextFilter = new LawTextFilterModel();
        this.modelFetchPenalty = new LawFetchPenaltyModel(); // 250504
        this.modelFetchPenaltyIds = new LawFetchPenaltyIdsModel(); // 250505

        this.modelFetchReference = new LawFetchReferenceModel();           // 추가
        this.modelFetchReferenceIds = new LawFetchReferenceIdsModel();     // 추가


        this.dataManager = new LawDataManager();

        this.penaltyEventManager = new LawPenaltyEventManager(this);
        this.referenceEventManager = new LawReferenceEventManager(); // 250515


        // 이벤트매니저들을 배열로 관리
        this.eventManagers = [
            new LawHeaderEventManager(this),
            new LawTextSizeEventManager(this),
            new LawSearchEventManager(this),
            new LawTextSearchEventManager(this),
            // new LawPenaltyEventManager(this) // ← 추가            
            this.penaltyEventManager, // ← 바로 등록
            // new LawReferenceEventManager(), // ← 추가      
            this.referenceEventManager // ← 바로 등록      


        ];

        this.view = new LawView();
        this.viewPenalty = new LawPenaltyView(); // 250504


        // this.eventManager = new LawEventManager(this);



    }

    async initialize(): Promise<void> {

        CurrentLawBox.update();

        // 초기 벌칙 id_a 로드 : 250505
        this.dataManager.setPenaltyIds(await this.modelFetchPenaltyIds.getPenaltyIds());
        this.view.setPenaltyIds(this.dataManager.getPenaltyIds());

        // 참조 id 세팅 (모델 사용)
        // 참조 id 세팅 (모델 사용)
        this.dataManager.setReferenceData(await this.modelFetchReferenceIds.getReferenceIds());
        this.view.setReferenceData(this.dataManager.getReferenceData());

        // 초기 데이터 로드 및 렌더링
        // const results = await this.model.getAllLaws();        
        // Store initial results
        // await this.dataManager.setAllLaws(); // 결합도 제거! 위임없이 컨트롤러 본연의 역할 수행        
        this.dataManager.setCurrentResults(await this.modelFetchAll.getAllLaws());
        // this.view.render(this.dataManager.currentResults);
        this.view.render(this.dataManager.getCurrentResults());


        // 체크박스 렌더링
        // const lawTitles = await this.model.getLawTitles();
        this.dataManager.setLawTitles(await this.modelFetchTitle.getLawTitles());
        // await this.dataManager.setLawTitles();

        // document.getElementById('lawCheckboxes')!.innerHTML = 
        // this.view.lawTable.renderLawCheckboxes(this.dataManager.lawTitles);
        // this.view.lawTable.renderLawCheckboxes(this.dataManager.getLawTitles());

        this.view.renderLawCheckboxes(this.dataManager.getLawTitles());
        // 이벤트 바인딩을 컨트롤러에서 일괄 처리
        // this.eventManager.bindEvents();
        // 모든 이벤트매니저의 이벤트 바인딩 실행
        // this.eventManagers.forEach(em => em.bindEvents());
        this.bindAllEvents();

    }

    // 이벤트매니저에서 호출하기 위한 public 메서드
    public bindAllEvents(): void {
        this.eventManagers.forEach(em => em.bindEvents());
    }

    /**
     * 렌더링 후 동적으로 생성된 버튼에만 이벤트를 바인딩하는 메서드
     * (info 버튼, 조문별 벌칙 버튼)
     */
    public bindPostRenderEvents(): void {
        // 1. Info/Changelog 버튼 바인딩
        this.view.setInfoButtonHandler();

        // 2. 조문별 벌칙 버튼 바인딩
        // this.penaltyEventManager.bindArticlePenaltyButtons();
        this.penaltyEventManager.bindArticleEvents();
        this.referenceEventManager.bindEvents();

    }

    // 이하는 이벤트바인딩 함수

    // // 이벤트바인딩 래퍼 (초기화할때만 사용)
    // private bindEvents(): void {
    //     this.bindHeaderEvents();
    //     this.bindTextSizeEvents();
    //     this.bindSearchEvents();  
    //     this.bindToggleButtonEvents();       
    //     this.bindTextSearchEvents()       
    // }

    // // 개별 이벤트바인딩 함수
    // private bindHeaderEvents(): void {
    //     this.view.header.setInfoButtonHandler();
    // }

    // private bindTextSizeEvents(): void {
    //     document.querySelectorAll('input[name="textSize"]').forEach(radio => {
    //         radio.addEventListener('change', (e: Event) => this.handleTextSizeChange(e));
    //     });
    // }  
    // private bindSearchEvents(): void {
    //     const searchBtn = document.getElementById('lawSearchBtn');
    //     if (searchBtn) {
    //         searchBtn.addEventListener('click', () => this.handleSearch());
    //     }
    // } 

    // private bindToggleButtonEvents(): void {
    //     const searchContent = document.getElementById('lawSearchContent');
    //     if (searchContent) {
    //         searchContent.addEventListener('show.bs.collapse', () => {
    //             document.querySelector('.floating-search-btn')?.classList.remove('d-none');
    //         });

    //         searchContent.addEventListener('hide.bs.collapse', () => this.handleCollapseHide());
    //     }
    // } 

    // private bindTextSearchEvents(): void {
    //     const searchInput = document.getElementById('lawTextSearch') as HTMLInputElement;
    //     const searchBtn = document.getElementById('lawTextSearchBtn');

    //     const performTextSearch = () => {
    //         const searchText = searchInput.value;
    //         const filteredResults = this.model.filterByText(searchText, this.dataManager.currentResults);
    //         this.view.render(filteredResults, searchText);
    //         this.view.showToast('검색결과를 재조회하였습니다.');
    //     };

    //     // 검색 버튼 클릭 이벤트
    //     searchBtn?.addEventListener('click', performTextSearch);

    //     // 엔터키 이벤트
    //     searchInput?.addEventListener('keypress', (e: KeyboardEvent) => {
    //         if (e.key === 'Enter') {
    //             e.preventDefault(); // 폼 제출 방지
    //             performTextSearch();
    //         }
    //     });
    // }


    // ////////////////////////////////////////////////////
    // // 이하는 이벤트핸들러
    // ////////////////////////////////////////////////////

    // private async handleSearch(): Promise<void> {
    //     const selectedLaws = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
    //         .map(cb => (cb as HTMLInputElement).value)
    //         .filter(id => id); // Filter out null values

    //     if (selectedLaws.length) {
    //         const results = await this.model.getLawsByIds(selectedLaws);
    //         this.dataManager.currentResults = results;
    //         this.view.render(results);
    //         this.view.showToast('검색결과를 재조회하였습니다.'); // 추가  

    //         // 조문별 선택조회 접기 (Bootstrap 없이 직접 class 조작)
    //         const searchContent = document.getElementById('lawSearchContent');
    //         if (searchContent) {
    //             searchContent.classList.remove('show');
    //             searchContent.classList.add('collapse');
    //             this.handleCollapseHide(); // 재사용!
    //         }

    //         this.bindHeaderEvents();
    //     }
    // }    

    // // 재사용하기 위한 함수 : 조문별 선택조회 접기
    // private handleCollapseHide(): void {
    //     document.querySelector('.floating-search-btn')?.classList.add('d-none');
    //     window.scrollTo({
    //         top: 0,
    //         behavior: 'smooth'
    //     });
    // }    


    // private handleTextSizeChange(e: Event): void {
    //     const target = e.target as HTMLInputElement;
    //     this.view.lawTable.setTextSize(target.value);
    //     this.view.render(this.dataManager.currentResults);
    //     // Rebind all events after re-render
    //     this.bindHeaderEvents();
    // }
}