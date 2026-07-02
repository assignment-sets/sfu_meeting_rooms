import mongoose from 'mongoose';

const MemberSchema = new mongoose.Schema({
  socketId: {
    type: String,
    required: true,
  },
  userId: {
    type: String, // Storing Clerk's explicit user string identifier (e.g. 'user_3Fw7SsROy1bdetzGJvxhrX2iuGb')
    required: true,
  },
  // MediaSoup Pipelines (Null until Step 2/Step 4 execution)
  sendTransportId: {
    type: String,
    default: null,
  },
  recvTransportId: {
    type: String,
    default: null,
  },
  // Active Local Micro-stream Track IDs (Null until Step 3 execution)
  videoProducerId: {
    type: String,
    default: null,
  },
  audioProducerId: {
    type: String,
    default: null,
  },
}, { _id: false }); // Explicitly false so Mongo does not bloat memory creating _id properties on your active participants

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Tracks which Clerk user built the session room space
  hostUserId: {
    type: String,
    required: true,
    index: true,
  },
  // Active Router reference allocated to this specific room instance
  mediasoupRouterId: {
    type: String,
    default: null,
  },
  // List of participants currently holding socket connections inside this space
  members: [MemberSchema],
}, { 
  timestamps: true,
  collection: 'vidCallingApp'
});

export const Room = mongoose.model('Room', RoomSchema);
