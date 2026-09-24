/**
 * Testing utilities for BCH Connect. Provides a connector whose every outcome
 * is scripted, and the demo protocol definitions it implements.
 *
 * @packageDocumentation
 */

export type {
	FakeConnector,
	FakeConnectorHandle,
	FakeConnectorScript,
	FakeLogEntry,
	FakeMethodScript,
	FakeMethodScripts,
	FakePendingRequest,
	FakeRequestCall,
} from "./fake-connector.js";
export { createFakeConnector } from "./fake-connector.js";
export type {
	DemoAltProtocol,
	DemoAltSessionData,
	DemoProtocol,
	DemoSessionData,
} from "./protocols.js";
export { demoAltSession, demoSession } from "./protocols.js";
export type { FakeSessionInit } from "./session.js";
export { fakeSession } from "./session.js";
