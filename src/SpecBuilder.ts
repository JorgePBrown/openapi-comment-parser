import {
	BaseDefinition,
	OpenApiObject,
	PathsObject,
	InfoObject,
	ServerObject,
	ComponentsObject,
	SecurityRequirementObject,
	TagObject,
	ExternalDocumentationObject,
	OperationObject,
	ResponseGroupObject,
	ReferenceObject,
	ResponseObject,
} from './exported';
import objectMerge from './util/objectMerge';
import _ from 'lodash';

class SpecBuilder implements OpenApiObject {
	openapi: string;
	info: InfoObject;
	servers?: ServerObject[];
	paths: PathsObject;
	components?: ComponentsObject;
	security?: SecurityRequirementObject[];
	tags?: TagObject[];
	externalDocs?: ExternalDocumentationObject;

	constructor(baseDefinition: BaseDefinition) {
		this.openapi = baseDefinition.openapi;
		this.info = baseDefinition.info;
		this.servers = baseDefinition.servers;
		this.paths = baseDefinition.paths || {};
		this.components = baseDefinition.components;
		this.security = baseDefinition.security;
		this.tags = baseDefinition.tags;
		this.externalDocs = baseDefinition.externalDocs;
	}

	addData(parsedFile: OpenApiObject[]) {
		parsedFile.forEach((file) => {
			const { paths, components, ...rest } = file;

			// only merge paths and components
			objectMerge(this, {
				paths: paths,
				components: components,
			} as OpenApiObject);

			// overwrite everthing else:
			Object.entries(rest).forEach(([key, value]) => {
				this[key as keyof OpenApiObject] = value;
			});
		});
	}

	resolveResponseGroups() {
		for (const p in this.paths) {
			for (const verb of ["get", "put", "post", "delete", "options", "head", "patch", "trace"]) {
				const op = this.paths[p as keyof PathsObject][verb as "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace"]
				if (op === undefined) {
					continue;
				}
				if (op.responseGroups === undefined) {
					continue
				}
				for (const { $ref } of op.responseGroups) {
					const segments = $ref.split("/")
					if (segments.length < 1 || segments[0] !== "#") {
						throw new Error(`invalid response group reference ${$ref}. Need '#/path/to/response/group' format`)
					}
					let rg: any = this
					for (let i = 1; rg !== undefined && i < segments.length; ++i) {
						rg = rg[segments[i]]
					}
					if (rg === undefined) {
						throw new Error(`unable to resolve response group reference ${$ref}`)
					}
					this.mergeResponseObjects(op, _.cloneDeep(rg as ResponseGroupObject))
				}
				delete op.responseGroups
			}
		}
	}

	resolveResponse($ref: string) {
		const segments = $ref.split("/")
		if (segments.length < 1 || segments[0] !== "#") {
			throw new Error(`invalid response reference ${$ref}. Need '#/path/to/response' format`)
		}
		let rg: any = this
		for (let i = 1; rg !== undefined && i < segments.length; ++i) {
			rg = rg[segments[i]]
		}
		if (rg === undefined) {
			throw new Error(`unable to resolve response reference ${$ref}`)
		}
		return rg as ResponseObject
	}

	mergeResponseObjects(operation: OperationObject, rg: ResponseGroupObject) {
		for (const status in rg) {
			const response = rg[status as keyof typeof rg]
			if (operation.responses[status] === undefined) {
				operation.responses[status] = response
			} else {
				let res: ResponseObject | ReferenceObject = operation.responses[status]
				if ("$ref" in res) {
					res = this.resolveResponse(res.$ref)
					operation.responses[status] = res
				}
				if (res.description === undefined) {
					res.description = response.description
				}
				if (response.headers !== undefined) {
					if (res.headers === undefined) {
						res.headers = response.headers
					} else {
						_.defaultsDeep(res.headers, _.cloneDeep(response.headers))
					}
				}
				if (response.links !== undefined) {
					if (res.links === undefined) {
						res.links = response.links
					} else {
						_.defaultsDeep(res.links, _.cloneDeep(response.links))
					}
				}
				if (response.content !== undefined) {
					if (res.content === undefined) {
						res.content = response.content
					} else {
						_.defaultsDeep(res.content, _.cloneDeep(response.content))
					}
				}
			}
		}
	}
}

export default SpecBuilder;
