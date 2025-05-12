import { Context } from "./types"


export default () => (ctx: Context) => {
	const juzId = Number(ctx.to.params.id);

	if (juzId > 0 && juzId <= 30) {
		return ctx.next();
	} else {
		return ctx.next("/error");
	}
};
