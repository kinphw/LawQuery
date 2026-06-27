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
import { LawFetchPivotModel } from "../models/LawFetchPivotModel";
import { LawFetchListModel, LawListEntry } from "../models/LawFetchListModel";
import { setLawRegistry } from "../config/LawConfig";

import { LawView } from "../views/LawView";
import { LawPenaltyView } from "../views/components/LawPenaltyView";
import { LawAnnexView } from "../views/components/LawAnnexView";
// import { LawResult } from "../types/LawResult";

import { CurrentLawBox } from "../views/components/CurrentLawBox";

import { getMe, isPro } from "../../common/AuthState";
import { UpsellNotice } from "../../common/components/UpsellNotice";

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
    private modelFetchPivot!: LawFetchPivotModel; // 기준 전환 피벗
    private modelFetchList!: LawFetchListModel;    // 법령 목록(드롭다운/설정 단일 출처)
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
        this.modelFetchPivot = new LawFetchPivotModel();
        this.modelFetchList = new LawFetchListModel();

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

        // 법령 목록(DB의 ldb_* 스캔)으로 드롭다운/설정을 동적 구성 → 새 법령 추가 시 프론트 코드 수정 0.
        await this.bootstrapLawRegistry();

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

        // 헤더는 1회만 (정렬기준 셀렉터가 그 아래 위치)
        this.view.renderHeaderOnly();

        // 연계표 단일 진입. 비회원/free는 '상위 3개 조' 티저로 첫 화면에서 킬 기능을 바로 본다.
        if (pro) {
            await this.showLinkedMode(meta);
        } else {
            await this.showLinkedTeaser();
        }
    }

    /** 연계표 모드(PRO). 기준=법(a)이면 기존 5단 연계, 그 외(e/s/r/b)면 피벗 연계표. */
    private async showLinkedMode(meta: import("../models/LawFetchMetaModel").LawMeta[]): Promise<void> {
        // 상단 기준 셀렉터(법·시행령·…) — base=a는 기존 5단표, 나머지는 피벗.
        const base = this.getBase();
        this.renderBaseSelector(meta, base);
        if (base !== 'a') {
            await this.renderPivot(meta, base);
            return;
        }

        // ── 기준=법(a): 기존 5단 연계 흐름(무손상) ──
        // 초기 벌칙 id_a 로드 : 250505
        this.dataManager.setPenaltyIds(await this.modelFetchPenaltyIds.getPenaltyIds());
        this.view.setPenaltyIds(this.dataManager.getPenaltyIds());

        // 참조 id 세팅 (모델 사용)
        this.dataManager.setReferenceData(await this.modelFetchReferenceIds.getReferenceIds());
        this.view.setReferenceData(this.dataManager.getReferenceData());

        // 별표 id 세팅
        this.view.setAnnexIds(await this.modelFetchAnnexIds.getAnnexIds());

        // 강조는 '하위 기준조회(피벗)'에서만 — 법(최상위) 기준에선 위에 상위가 없어 의미 없고
        // 본문을 흐리게만 만들어 방해됨. base='a'에서는 비활성(highlights 빈 채로 둠).
        this.view.setHighlights([]);

        // 초기 데이터 로드 및 렌더링 (pro는 전체 데이터)
        const all = await this.modelFetchAll.getAllLaws();
        this.dataManager.setCurrentResults(all.data);
        this.view.render(this.dataManager.getCurrentResults());

        // 체크박스 렌더링
        this.dataManager.setLawTitles(await this.modelFetchTitle.getLawTitles());
        this.view.renderLawCheckboxes(this.dataManager.getLawTitles());

        // 이벤트 바인딩 일괄 처리
        this.bindAllEvents();
    }

    /**
     * 연계표 티저(비회원·free). 서버가 상위 3개 조만 내려준다(나머지 미전송 → 무유출).
     * 표 아래에 "회원가입 시 전체 조회" 안내 플레이스홀더를 덧붙인다.
     * 벌칙·별표·참조·조문선택 등 부가 킬 기능은 티저에서 감춘다(클릭 시 잠긴 엔드포인트라 혼란 방지).
     */
    private async showLinkedTeaser(): Promise<void> {
        this.hideEl('penaltyBtn');
        this.hideEl('annexBtn');
        this.hideEl('lawArticleCard');
        this.hideEl('lawSearchCard');

        const all = await this.modelFetchAll.getAllLaws(); // 비회원엔 상위 3개 조 + locked
        this.dataManager.setCurrentResults(all.data);
        this.view.render(this.dataManager.getCurrentResults());

        // 표 아래 안내(실제 잠긴 내용은 담지 않음)
        UpsellNotice.appendInside('results', '회원가입 시 전체 연계표(법·시행령·감독규정·세칙·별표)를 조회할 수 있습니다');
    }

    private hideEl(id: string): void {
        const el = document.getElementById(id);
        if (el) el.classList.add('d-none');
    }

    // ── 법령 레지스트리(동적 드롭다운/설정) ───────────────────────────

    /** /api/law/list 로 레지스트리 채우고, 드롭다운 생성 + 현재 법령의 step 정규화. */
    private async bootstrapLawRegistry(): Promise<void> {
        const list = await this.modelFetchList.getList();
        if (!list.length) return; // 실패 시 기존 하드코딩 드롭다운/LawConfig 폴백 유지

        setLawRegistry(list); // getLawConfig(...)가 이제 DB값을 반환(originMap 등)

        const params = new URLSearchParams(window.location.search);
        const lawParam = params.get('law');
        // 명시된 법령의 step 이 비었거나 실제 레벨 수와 다르면 보정(리로드 없이 replaceState).
        if (lawParam) {
            const entry = list.find(e => e.code === lawParam);
            if (entry && params.get('step') !== String(entry.step)) {
                params.set('step', String(entry.step));
                history.replaceState(null, '', `?${params.toString()}`);
            }
        }

        this.renderLawDropdown(list, lawParam || 'j');
    }

    /** 법령 선택 드롭다운을 목록으로 생성(링크에 올바른 step 자동 첨부). */
    private renderLawDropdown(list: LawListEntry[], current: string): void {
        const ul = document.getElementById('lawDropdownMenu');
        if (!ul) return;
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        ul.innerHTML = list.map(e =>
            `<li><a class="dropdown-item${e.code === current ? ' active' : ''}" href="?law=${encodeURIComponent(e.code)}&step=${e.step}">${esc(e.label)}</a></li>`,
        ).join('');
    }

    // ── 기준 전환(피벗) ─────────────────────────────────────────────

    private getStep(): number {
        return parseInt(new URLSearchParams(window.location.search).get('step') || '4', 10);
    }

    /** URL ?base= → 유효(레벨 범위 내, a 포함)하면 그 값, 아니면 'a'(기존 5단표). */
    private getBase(): string {
        const b = (new URLSearchParams(window.location.search).get('base') || 'a').toLowerCase();
        const levels = ['a', 'e', 's', 'r', 'b'].slice(0, this.getStep());
        return levels.includes(b) ? b : 'a';
    }

    /** 상단 기준 셀렉터(법·시행령·…). 클릭 시 ?base= 갱신 후 리로드(이벤트 생명주기 단순화). */
    private renderBaseSelector(meta: import("../models/LawFetchMetaModel").LawMeta[], current: string): void {
        const host = document.getElementById('lawBaseHost');
        if (!host) return;
        const levels = ['a', 'e', 's', 'r', 'b'].slice(0, this.getStep());
        const short: Record<string, string> = {};
        meta.forEach(m => { short[m.origin] = m.short_name; });

        const btns = levels.map(lv => {
            const active = lv === current ? 'btn-primary' : 'btn-outline-primary';
            return `<button type="button" class="btn ${active} lq-base-btn" data-base="${lv}">${short[lv] || lv}</button>`;
        }).join('');

        host.innerHTML = `
            <div class="d-flex align-items-center gap-1">
                <span class="text-muted small">정렬기준</span>
                <div class="btn-group btn-group-sm" role="group" aria-label="기준 레벨">${btns}</div>
            </div>`;

        host.querySelectorAll('.lq-base-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = (btn as HTMLElement).dataset.base!;
                if (next === current) return;
                const p = new URLSearchParams(window.location.search);
                if (next === 'a') p.delete('base'); else p.set('base', next);
                window.location.search = p.toString(); // 리로드 → initialize가 해당 기준으로 렌더
            });
        });
    }

    /**
     * 피벗 연계표 렌더(기준 e/s/r/b). 5단표와 '완전히 동일한' 렌더 경로(view.render/LawTable)를 사용.
     * 데이터만 기준 재배치된 트리이고, 디자인·벌칙/참조/별표 버튼은 5단과 동일하게 흐른다.
     */
    private async renderPivot(_meta: import("../models/LawFetchMetaModel").LawMeta[], base: string): Promise<void> {
        this.hideEl('lawArticleCard'); // 조문별 선택조회는 5단 전용(피벗 미지원)

        // 킬 버튼용 id 세트 로드(5단 연계 흐름과 동일)
        this.dataManager.setPenaltyIds(await this.modelFetchPenaltyIds.getPenaltyIds());
        this.view.setPenaltyIds(this.dataManager.getPenaltyIds());
        this.dataManager.setReferenceData(await this.modelFetchReferenceIds.getReferenceIds());
        this.view.setReferenceData(this.dataManager.getReferenceData());
        this.view.setAnnexIds(await this.modelFetchAnnexIds.getAnnexIds());
        this.view.setHighlights(await this.modelFetchArticle.getHighlights());

        // 기준 재배치 트리 → 5단표와 동일하게 view.render
        const tree = await this.modelFetchPivot.getPivot(base);
        this.dataManager.setCurrentResults(tree);
        this.view.render(this.dataManager.getCurrentResults());

        // 이벤트 바인딩(5단과 동일 매니저 — 벌칙/참조/별표 버튼 포함)
        this.bindAllEvents();
        this.bindPostRenderEvents();
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