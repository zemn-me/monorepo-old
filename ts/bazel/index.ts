import { isDefined, must } from 'ts/guard';
export const workspaceDirectory = () =>
	must(
		isDefined,
		() => 'BUILD_WORKING_DIRECTORY unspecified'
	)(process.env['BUILD_WORKING_DIRECTORY']);
