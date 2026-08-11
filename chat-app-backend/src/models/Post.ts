import { Schema, model, Document, Types } from 'mongoose';

// Mapea la colección compartida `posts` (misma base que `holy_app`/la web — ver
// `postModel.js`). Espejo completo: la web y la app escriben y leen el mismo
// documento, así que el schema debe coincidir campo a campo. Sin `collection:`
// override: la pluralización default de Mongoose para "Post" ya da "posts".
export interface IReaction {
  emoji: string;
  users: Types.ObjectId[];
}

export interface IReply {
  _id: Types.ObjectId;
  content?: string;
  image?: string;
  user: Types.ObjectId;
  createdAt: Date;
  reactions: IReaction[];
}

export interface IComment {
  _id: Types.ObjectId;
  content?: string;
  image?: string;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
  reactions: IReaction[];
  replies: IReply[];
}

export interface IPostLive {
  isLiveStream: boolean;
  youtubeVideoId?: string;
  status?: 'live' | 'ended';
  startedAt?: Date;
  endedAt?: Date;
}

export interface IPostVerse {
  book?: string;
  chapter?: number;
  verse?: number;
  text?: string;
}

export interface IPostLinked {
  type?: 'activity' | 'plan' | 'prayer' | 'answered' | 'seminar' | 'material' | 'bible';
  refId?: string;
  groupId?: Types.ObjectId;
  groupName?: string;
  groupImage?: string;
  title?: string;
  url?: string;
  text?: string;
  version?: string;
  verses?: IPostVerse[];
}

export interface IShareCounts {
  facebook: number;
  messenger: number;
  twitter: number;
  telegram: number;
  whatsapp: number;
  pinterest: number;
  email: number;
  threads: number;
  linkedin: number;
  webshare: number;
}

export interface IPost extends Document {
  author: Types.ObjectId;
  content?: string;
  image?: string;
  file?: unknown[];
  likes: Types.ObjectId[];
  sharedBy: Types.ObjectId[];
  reactions: IReaction[];
  comments: IComment[];
  savedBy: Types.ObjectId[];
  isRichText: boolean;
  live?: IPostLive;
  linked?: IPostLinked;
  shareCounts: IShareCounts;
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String },
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

const ReplySchema = new Schema<IReply>({
  content: { type: String },
  image: { type: String },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  reactions: [ReactionSchema],
});

const CommentSchema = new Schema<IComment>({
  content: { type: String },
  image: { type: String },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  reactions: [ReactionSchema],
  replies: [ReplySchema],
});

const ZERO_SHARE_COUNTS: IShareCounts = {
  facebook: 0, messenger: 0, twitter: 0, telegram: 0, whatsapp: 0,
  pinterest: 0, email: 0, threads: 0, linkedin: 0, webshare: 0,
};

const PostSchema = new Schema<IPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String },
    image: { type: String },
    file: [{ type: Schema.Types.Mixed }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    sharedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: [ReactionSchema],
    comments: [CommentSchema],
    savedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isRichText: { type: Boolean, default: false },
    live: {
      isLiveStream: { type: Boolean, default: false },
      youtubeVideoId: { type: String },
      status: { type: String, enum: ['live', 'ended'] },
      startedAt: { type: Date },
      endedAt: { type: Date },
    },
    linked: {
      type: {
        type: String,
        enum: ['activity', 'plan', 'prayer', 'answered', 'seminar', 'material', 'bible'],
      },
      refId: { type: String },
      groupId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
      groupName: { type: String },
      groupImage: { type: String },
      title: { type: String },
      url: { type: String },
      text: { type: String },
      version: { type: String },
      verses: [
        {
          _id: false,
          book: { type: String },
          chapter: { type: Number },
          verse: { type: Number },
          text: { type: String },
        },
      ],
    },
    shareCounts: {
      type: {
        facebook: { type: Number, default: 0 },
        messenger: { type: Number, default: 0 },
        twitter: { type: Number, default: 0 },
        telegram: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        pinterest: { type: Number, default: 0 },
        email: { type: Number, default: 0 },
        threads: { type: Number, default: 0 },
        linkedin: { type: Number, default: 0 },
        webshare: { type: Number, default: 0 },
      },
      default: ZERO_SHARE_COUNTS,
    },
  },
  { timestamps: true }
);

export const Post = model<IPost>('Post', PostSchema);
