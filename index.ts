import { findByProps, findByName } from "@revenge-mod/metro";
import { instead, after } from "@revenge-mod/patcher";
import { commands } from "@revenge-mod/api";

const Messages = findByProps("sendMessage");
const UserStore = findByProps("getCurrentUser");
const ChannelStore = findByProps("getChannel");
const SelectedChannelStore = findByProps("getChannelId");

let victims = new Set<string>();          // user IDs to echo
let lastEcho = new Map<string, string>(); // message ID → echoed ID

/* ---------- slash command ---------- */
commands.register({
  name: "annoy",
  description: "Start/stop echoing a user for this session",
  options: [
    {
      name: "user",
      description: "Who to echo",
      type: 6, // USER
      required: true,
    },
  ],

  execute: async (args, ctx) => {
    const targetId = args[0].value;
    if (victims.has(targetId)) {
      victims.delete(targetId);
      return { content: `Stopped echoing <@${targetId}>.`, ephemeral: true };
    } else {
      victims.add(targetId);
      return { content: `Now echoing <@${targetId}> in this channel.`, ephemeral: true };
    }
  },
});

/* ---------- hook message create ---------- */
const unpatch = after("dispatch", findByProps("dispatch"), (_, [event]) => {
  if (event.type !== "MESSAGE_CREATE") return;

  const msg = event.message;
  const me = UserStore.getCurrentUser();
  const chan = ChannelStore.getChannel(msg.channel_id);

  // ignore self, bots, DMs, or if author isn't on the list
  if (
    msg.author.id === me.id ||
    msg.author.bot ||
    !chan ||
    chan.type !== 0 || // 0 = guild text
    !victims.has(msg.author.id)
  ) return;

  // echo only once per incoming message
  if (lastEcho.has(msg.id)) return;

  const echo = {
    content: msg.content,
    embeds: msg.embeds,
    stickers: msg.sticker_items,
    allowed_mentions: { parse: [] }, // don't ping
    message_reference: { message_id: msg.id, channel_id: msg.channel_id },
  };

  Messages.sendMessage(msg.channel_id, echo).then((sent) =>
    lastEcho.set(msg.id, sent.id)
  );
});

/* ---------- cleanup on unload ---------- */
export const onUnload = () => {
  commands.unregister("annoy");
  unpatch();
  victims.clear();
  lastEcho.clear();
};
