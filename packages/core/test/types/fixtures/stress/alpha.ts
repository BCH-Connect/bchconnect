/**
 * Alpha, a stress protocol for scale tests. Weighted like a real protocol:
 * 10 methods, 4 events, 4 capabilities and a nested session payload.
 */
import type { Connector, ProtocolDefinition } from "../../../../src/index.js";

export interface AlphaSessionData {
	readonly accountId: string;
	readonly endpoints: readonly string[];
	readonly meta: {
		readonly version: number;
		readonly features: readonly string[];
		readonly nested: { readonly deep: { readonly deeper: string } };
	};
}

export interface Alpha extends ProtocolDefinition {
	id: "alpha";
	session: AlphaSessionData;
	methods: {
		alpha_method1: {
			params: {
				readonly field1: string;
				readonly count1: number;
				readonly blob1: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload1: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method2: {
			params: {
				readonly field2: string;
				readonly count2: number;
				readonly blob2: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload2: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method3: {
			params: {
				readonly field3: string;
				readonly count3: number;
				readonly blob3: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload3: { readonly a: string; readonly b: bigint };
			};
			userInteraction: true;
		};
		alpha_method4: {
			params: {
				readonly field4: string;
				readonly count4: number;
				readonly blob4: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload4: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method5: {
			params: {
				readonly field5: string;
				readonly count5: number;
				readonly blob5: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload5: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method6: {
			params: {
				readonly field6: string;
				readonly count6: number;
				readonly blob6: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload6: { readonly a: string; readonly b: bigint };
			};
			userInteraction: true;
		};
		alpha_method7: {
			params: {
				readonly field7: string;
				readonly count7: number;
				readonly blob7: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload7: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method8: {
			params: {
				readonly field8: string;
				readonly count8: number;
				readonly blob8: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload8: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
		alpha_method9: {
			params: {
				readonly field9: string;
				readonly count9: number;
				readonly blob9: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload9: { readonly a: string; readonly b: bigint };
			};
			userInteraction: true;
		};
		alpha_method10: {
			params: {
				readonly field10: string;
				readonly count10: number;
				readonly blob10: Uint8Array;
			};
			result: {
				readonly ok: boolean;
				readonly payload10: { readonly a: string; readonly b: bigint };
			};
			timeoutMs: 30_000;
		};
	};
	events: {
		alpha_event1: {
			readonly seq: number;
			readonly data1: { readonly k: string };
		};
		alpha_event2: {
			readonly seq: number;
			readonly data2: { readonly k: string };
		};
		alpha_event3: {
			readonly seq: number;
			readonly data3: { readonly k: string };
		};
		alpha_event4: {
			readonly seq: number;
			readonly data4: { readonly k: string };
		};
	};
	capability: "alpha-cap1" | "alpha-cap2" | "alpha-cap3" | "alpha-cap4";
}

export declare function alpha(config?: { endpoint?: string }): Connector<Alpha>;
