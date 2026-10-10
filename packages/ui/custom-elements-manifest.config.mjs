// Cleans up two analyzer false positives that would otherwise leak into the
// manifest; `@internal`/`@ignore` members are already excluded natively.
function cleanManifest() {
	/** @type {Map<string, Set<string>>} class name -> property names assigned through a nested receiver in its constructor */
	const nestedAssignments = new Map();

	return {
		name: "clean-manifest",
		analyzePhase({ ts, node }) {
			if (!ts.isConstructorDeclaration(node)) return;
			const className = ts.isClassDeclaration(node.parent)
				? node.parent.name?.getText()
				: undefined;
			if (className === undefined || node.body === undefined) return;

			for (const statement of node.body.statements) {
				if (!ts.isExpressionStatement(statement)) continue;
				const expression = statement.expression;
				if (
					!ts.isBinaryExpression(expression) ||
					!ts.isPropertyAccessExpression(expression.left)
				) {
					continue;
				}
				// `this.x = …` is a real field; the analyzer also (mis)reads a
				// deeper receiver, e.g. `this.#root.adoptedStyleSheets = …`, as a
				// field of this class, naming it after the rightmost property.
				if (expression.left.expression.kind === ts.SyntaxKind.ThisExpression)
					continue;
				let names = nestedAssignments.get(className);
				if (names === undefined) {
					names = new Set();
					nestedAssignments.set(className, names);
				}
				names.add(expression.left.name.getText());
			}
		},
		packageLinkPhase({ customElementsManifest }) {
			for (const module of customElementsManifest.modules ?? []) {
				for (const declaration of module.declarations ?? []) {
					const bogusNames = nestedAssignments.get(declaration.name);
					if (Array.isArray(declaration.members)) {
						declaration.members = declaration.members.filter(
							(member) =>
								member.privacy !== "private" && !bogusNames?.has(member.name),
						);
					}
					// The shared `#emit` helper dispatches under a generic parameter
					// name, which the analyzer reads as a literal event named "type";
					// every real public event is named `bchc-*` and already
					// documented above the class via `@fires`.
					if (Array.isArray(declaration.events)) {
						declaration.events = declaration.events.filter((event) =>
							event.name?.startsWith("bchc-"),
						);
					}
				}
			}
		},
	};
}

export default {
	globs: ["src/**/*.ts"],
	exclude: ["src/**/*.generated.ts", "src/css.d.ts"],
	outdir: ".",
	// package.json already declares "customElements" by hand; the analyzer's
	// own writer reformats the whole file (2-space indent) on every run.
	packagejson: false,
	plugins: [cleanManifest()],
};
