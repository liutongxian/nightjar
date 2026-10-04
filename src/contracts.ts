/** Serializable contract shared by the browser and the deterministic engine. */
export type StepId = 'hotel'|'flight'|'ground';
export interface Offer {id:string;label:string;amount:number;available:boolean;accessible:boolean;departureAt?:string;arrivalAt?:string;durationMinutes?:number}
export interface Receipt {reference:string;idempotencyKey:string;optionId:string;amount:number;currency:string;status:string;quoteVersion:number;planVersion:number;approvalLimit:number;[key:string]:unknown}
export interface Step {id:StepId;provider?:string;title:string;amount:number;status:string;idempotencyKey:string;[key:string]:unknown}
export interface ExecutionStep {id:StepId;title:string;status:string;attempts:number;reference:string|null;receipt:Receipt|null;idempotencyKey:string}
export interface Alternative {id:string;label:string;flight:Offer;ground:Offer;pickupAt:string;arrivalAt:string;total:number;currency:string;eligible:boolean;reasons:string[]}
export interface Plan {version:number;status:'ready'|'blocked';total:number|null;currency:string;arrivalAt:string|null;selectedOptionId:string|null;steps:Step[];alternatives:Alternative[];reasons:string[]}
export interface Provider {id:string;name:string;mode:string;version:number;bookings?:Receipt[];protections?:Receipt[];offers?:Offer[];requests:number;reconciliationRequests:number;[key:string]:unknown}
export interface RecoveryState {
 schemaVersion:number;
 scenario:Record<string,unknown>;
 providers:{airline:Provider & {bookings:Receipt[]};ground:Provider & {bookings:Receipt[]};hotel:Provider};
 constraints:{budget:number;latestArrival:string;accessibility:boolean;minDepartureLeadMinutes:number;minGroundConnectionMinutes:number};
 plan:Plan|null;
 approval:null|{planVersion:number;maxTotal:number;status:'approved'|'invalidated';reason:string|null};
 execution:{status:'idle'|'ready'|'running'|'needs-retry'|'blocked'|'completed';steps:ExecutionStep[];lastError:null|{code:string;message:string}};
 events:{id:string;at:string;type:string;title:string;detail:string|Record<string,unknown>}[];
 fault:{kind:string;consumed:boolean};
}
