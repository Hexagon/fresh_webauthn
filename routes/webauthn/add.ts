import { Handlers } from "$fresh/server.ts";
import { json, ReqWithBody } from "parsec";
import { config } from "base_config";
import { database, IUser } from "database";
import { Fido2 } from "utils/fido2.ts";
import { username as username_utils } from "utils/username.ts";
import { WithSession } from "fresh_session";

const f2l = new Fido2(
  config.rpId,
  config.rpName,
  undefined,
  config.challengeTimeoutMs,
);

export type Data = { session: Record<string, string> };

export const handler: Handlers<Data, WithSession> = {
  async POST(req, ctx) {
    const body: ReqWithBody = req;
    await json(body);
    const { session } = ctx.state;

    if (!body) {
      const resp = {
        "status": "failed",
        "message": "Request missing name or username field!",
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }

    if (!session.get("loggedIn")) {
      const resp = {
        "status": "failed",
        "message": "User not logged in!",
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }

    const usernameClean = username_utils.clean(session.get("username"));

    if (!usernameClean) {
      const resp = {
        "status": "failed",
        "message": "Invalid username!",
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }

    const users = await database.getCollection<IUser>("users");
    const userInfo = await users.findOne({ userName: usernameClean });

    const challengeMakeCred = await f2l.registration(
      usernameClean,
      usernameClean,
      userInfo.id || "",
    );

    // Transfer challenge to session
    session.set("challenge", challengeMakeCred.challenge);

    // Exclude existing credentials
    challengeMakeCred.excludeCredentials = userInfo.authenticators?.map((e) => {
      return { id: e.credId, type: e.type };
    });
    // Respond with credentials
    return new Response(JSON.stringify(challengeMakeCred), { status: 200 });
  },
};
