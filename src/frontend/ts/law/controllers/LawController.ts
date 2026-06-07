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
import { LawFetchAnnexModel } from "../models/LawFetchAnnexModel";
import { LawFetchAnnexIdsModel } from "../models/LawFetchAnnexIdsModel";
import { LawFetchArticleModel } from "../models/LawFetchArticleModel";
import { LawFetchMetaModel } from "../models/LawFetchMetaModel";

import { LawView } from "../views/LawView";
import { LawPenaltyView } from "../views/components/LawPenaltyView";
import { LawAnnexView } from "../views/components/LawAnnexView";
// import { LawResult } from "../types/LawResult";

import { CurrentLawBox } from "../views/components/CurrentLawBox";

import { getMe, isPro } from "../../common/AuthState";
import { LawUnitView } from "../views/LawUnitView";

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
    modelFetchAnnex: LawFetchAnnexModel;
    modelFetchAnnexIds: LawFetchAnnexIdsModel;
    modelFetchArticle: LawFetchArticleModel;
    modelFetchMeta: LawFetchMetaModel;

    view: LawView;
    viewPenalty: LawPenaltyView; // 250504
    viewAnnex: LawAnnexView;
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
    modelFetchAnnex!: LawFetchAnnexModel;
    modelFetchAnnexIds!: LawFetchAnnexIdsModel;
    modelFetchArticle!: LawFetchArticleModel;
    modelFetchMeta!: LawFetchMetaModel;

    view!: LawView;
    viewPenalty!: LawPenaltyView; // 250504
    viewAnnex!: LawAnnexView;
    // currentResults: LawResult[] = []; // Store current results
    private eventManagers: ILawEventManager[];
    private penaltyEventManager: LawPenaltyEventManager;
    private referenceEventManager: LawReferenceEventManager; // 250515
    private annexEventManager: import("./event/annex/LawAnnexEventManager").LawAnnexEventManager;

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
        this.modelFetchAnnex = new LawFetchAnnexModel();
        this.modelFetchAnnexIds = new LawFetchAnnexIdsModel();
        this.modelFetchArticle = new LawFetchArticleModel();
        this.modelFetchMeta = new LawFetchMetaModel();

        this.dataManager = new LawDataManager();

        this.penaltyEventManager = new LawPenaltyEventManager(this);
        this.referenceEventManager = new LawReferenceEventManager(); // 250515

        // Dynamic import workaround for now unless we import at top
        const { LawAnnexEventManager } = require('./event/annex/LawAnnexEventManager');
        this.annexEventManager = new LawAnnexEventManager(this);

        // 이벤트매니저들을 배열로 관리
        this.eventManagers = [
            new LawHeaderEventManager(this),
            new LawTextSizeEventManager(this),
            new LawSearchEventManager(this),
            new LawTextSearchEventManager(this),
            // new LawPenaltyEventManager(this) // ← 추가            
            this.penaltyEventManager, // ← 바로 등록
            // new LawReferenceEventManager(), // ← 추가      
            this.referenceEventManager, // ← 바로 등록      
            this.annexEventManager
        ];

        this.view = new LawView();
        this.viewPenalty = new LawPenaltyView(); // 250504
        this.viewAnnex = new LawAnnexView();


        // this.eventManager = new LawEventManager(this);



    }

    async initialize(): Promise<void> {

        // DB에서 법령명 메타 로드 → LawConfig 하드코딩 대체 (단일/연계 공통)
        const meta = await this.modelFetchMeta.getMeta();
        const me = await getMe();
        const pro = isPro(me);

        // 공통: 법령명/현재법령 박스/별표 원규정 표시명
        if (meta.length > 0) {
            this.view.setLawNames(meta.map(m => m.full_name));
            const label = meta.find(m => m.origin === 'a')?.full_name.split('\n')[0] ?? '';
            CurrentLawBox.updateWithLabel(label);
            const originMap: Record<string, string> = {};
            meta.forEach(m => { originMap[m.origin] = m.short_name; });
            this.viewAnnex.setOriginMap(originMap);
        } else {
            CurrentLawBox.update(); // fallback
        }

        // 헤더는 모드와 무관하게 1회 (토글바가 그 아래 위치)
        this.view.renderHeaderOnly();

        // 조회 방식 결정: URL ?view= → 없으면 PRO=연계(linked), 비PRO=단일(unit)
        const params = new URLSearchParams(window.location.search);
        let view = params.get('view');
        if (view !== 'unit' && view !== 'linked') view = pro ? 'linked' : 'unit';

        this.renderViewToggle(view as 'unit' | 'linked', pro);

        if (view === 'unit') {
            await this.showUnitMode(meta);
        } else if (pro) {
            await this.showLinkedMode();
        } else {
            this.showLinkedLocked(me.authenticated);
        }
    }

    /** 상단 조회방식 토글(단일 ↔ 연계표). 전환은 ?view= 갱신 후 리로드(이벤트 생명주기 단순화). */
    private renderViewToggle(current: 'unit' | 'linked', pro: boolean): void {
        const host = document.getElementById('lawViewToggleHost');
        if (!host) return;
        const lock = pro ? '' : ' <i class="fas fa-lock"></i>';
        // 연계표는 PRO 기능 → 잠금 여부와 무관하게 PRO 뱃지로 "이건 PRO" 각인
        const proTag = '<span class="badge ms-1" style="background:#6f42c1;color:#fff;font-size:.6rem;vertical-align:middle">PRO</span>';
        // PRO가 연계표를 쓰는 중이면 "PRO 전용 · BETA 전체 공개" 안내
        const note = (current === 'linked' && pro)
            ? `<div class="text-center mt-2"><span class="badge" style="background:#6f42c1;color:#fff">PRO</span> <span class="text-muted small">연계표·벌칙·별표는 PRO 전용 · BETA 기간 전체 공개 중</span></div>`
            : '';
        host.innerHTML = `
            <div class="d-flex justify-content-center">
                <div class="btn-group" role="group" aria-label="조회 방식">
                    <button type="button" class="btn btn-sm ${current === 'unit' ? 'btn-dark' : 'btn-outline-dark'} lq-view-btn" data-view="unit">개별 조회</button>
                    <button type="button" class="btn btn-sm ${current === 'linked' ? 'btn-dark' : 'btn-outline-dark'} lq-view-btn" data-view="linked">연계표${proTag}${lock}</button>
                </div>
            </div>${note}`;
        host.querySelectorAll('.lq-view-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = (btn as HTMLElement).dataset.view!;
                if (next === current) return;
                const p = new URLSearchParams(window.location.search);
                p.set('view', next);
                window.location.search = p.toString(); // 리로드 → initialize가 해당 모드로 렌더
            });
        });
    }

    /** 단일 조회 모드(회원가입 없이 이용). 연계 전용 정적 요소는 숨긴다. */
    private async showUnitMode(meta: import("../models/LawFetchMetaModel").LawMeta[]): Promise<void> {
        this.hideEl('penaltyBtn');
        this.hideEl('annexBtn');
        this.hideEl('lawArticleCard');
        const unitView = new LawUnitView(meta);
        await unitView.start();
    }

    /** 연계표 모드(PRO). 기존 5단 연계 조회 흐름. */
    private async showLinkedMode(): Promise<void> {
        // 초기 벌칙 id_a 로드 : 250505
        this.dataManager.setPenaltyIds(await this.modelFetchPenaltyIds.getPenaltyIds());
        this.view.setPenaltyIds(this.dataManager.getPenaltyIds());

        // 참조 id 세팅 (모델 사용)
        this.dataManager.setReferenceData(await this.modelFetchReferenceIds.getReferenceIds());
        this.view.setReferenceData(this.dataManager.getReferenceData());

        // 별표 id 세팅
        this.view.setAnnexIds(await this.modelFetchAnnexIds.getAnnexIds());

        // 초기 데이터 로드 및 렌더링
        this.dataManager.setCurrentResults(await this.modelFetchAll.getAllLaws());
        this.view.render(this.dataManager.getCurrentResults());

        // 체크박스 렌더링
        this.dataManager.setLawTitles(await this.modelFetchTitle.getLawTitles());
        this.view.renderLawCheckboxes(this.dataManager.getLawTitles());

        // 이벤트 바인딩 일괄 처리
        this.bindAllEvents();
    }

    /** 연계표를 비PRO가 선택했을 때: 잠금 화면 + 가입/문의 유도. */
    private showLinkedLocked(authenticated: boolean): void {
        this.hideEl('penaltyBtn');
        this.hideEl('annexBtn');
        this.hideEl('lawArticleCard');
        this.hideEl('lawSearchCard');
        const cta = authenticated
            ? '<span class="text-muted">PRO 등급에서 이용 가능합니다. 관리자에게 문의해 주세요.</span>'
            : '<a href="login.html" class="btn btn-primary btn-lg">가입하고 PRO 베타 이용 →</a>';
        const results = document.getElementById('results');
        if (results) results.innerHTML = `
            <div class="container">
                <div class="text-center p-5">
                    <div class="display-4 mb-3"><i class="fas fa-lock text-secondary"></i></div>
                    <h4 class="mb-2">5단 연계표는 PRO 전용입니다</h4>
                    <p class="text-muted mb-4">
                        법·시행령·감독규정·시행세칙·별표를 한 줄로 연결해 보는 기능입니다.<br>
                        <strong>단일 법규 개별조회</strong>는 위 토글에서 회원가입없이 이용하실 수 있습니다.
                    </p>
                    <div>${cta}</div>
                </div>
            </div>`;
    }

    private hideEl(id: string): void {
        const el = document.getElementById(id);
        if (el) el.classList.add('d-none');
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
        this.annexEventManager.bindArticleEvents();

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