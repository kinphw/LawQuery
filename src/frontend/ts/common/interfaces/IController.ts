export interface IController {
    initialize(): Promise<void>; // 컨트롤러는 initialize() 구현을 강제 (라우터가 불러야 하니까)
}