'use strict';
module.exports = {
 async up(q,S) { await q.sequelize.transaction(async(transaction)=>{
  const fk=(model,key='id')=>({type:S.INTEGER,allowNull:false,references:{model,key},onDelete:'RESTRICT'}), bookingId={...fk('bookings'),primaryKey:true};
  await q.addColumn('payments','bookingId',{...fk('bookings'),allowNull:true},{transaction});
  await q.addIndex('payments',['bookingId'],{transaction});
  await q.createTable('booking_platform_policy',{id:{type:S.INTEGER,primaryKey:true,allowNull:false},revision:{type:S.INTEGER,allowNull:false},allowNoShow:{type:S.BOOLEAN,allowNull:false},noShowGraceMinutes:{type:S.INTEGER,allowNull:false},ownerCancellationAllowed:{type:S.BOOLEAN,allowNull:false},cancellationLeadMinutes:{type:S.INTEGER,allowNull:false},cancellationText:{type:S.TEXT,allowNull:false}},{transaction});
  await q.createTable('field_confirmation_policies',{fieldId:{...fk('fields'),primaryKey:true},revision:{type:S.INTEGER,allowNull:false},mode:{type:S.STRING(16),allowNull:false},responseMinutes:{type:S.INTEGER,allowNull:false}},{transaction});
  await q.createTable('booking_reservation_records',{bookingId,revision:{type:S.INTEGER,allowNull:false},mode:{type:S.STRING(16),allowNull:false},expiresAt:{type:S.DATE,allowNull:true},policy:{type:S.JSON,allowNull:true},cancellation:{type:S.JSON,allowNull:true}},{transaction});
  await q.addIndex('booking_reservation_records',['expiresAt'],{transaction});
  await q.createTable('booking_reservation_events',{id:{type:S.INTEGER,primaryKey:true,autoIncrement:true,allowNull:false},bookingId:fk('bookings'),actorUserId:{...fk('users'),allowNull:true},action:{type:S.STRING(40),allowNull:false},fromStatus:{type:S.STRING(24),allowNull:true},toStatus:{type:S.STRING(24),allowNull:false},reason:{type:S.TEXT,allowNull:false},createdAt:{type:S.DATE,allowNull:false}},{transaction});
  await q.addIndex('booking_reservation_events',['bookingId','id'],{transaction});
  await q.createTable('booking_payment_validations',{paymentId:{...fk('payments'),primaryKey:true},bookingId:fk('bookings'),actorUserId:fk('users'),reason:{type:S.TEXT,allowNull:false},createdAt:{type:S.DATE,allowNull:false}},{transaction});
  await q.createTable('booking_financial_reviews',{bookingId,amount:{type:S.DECIMAL(12,2),allowNull:false},reason:{type:S.TEXT,allowNull:false},status:{type:S.STRING(24),allowNull:false},createdAt:{type:S.DATE,allowNull:false}},{transaction});
 });},
 async down(q){await q.sequelize.transaction(async(transaction)=>{for(const name of ['booking_financial_reviews','booking_payment_validations','booking_reservation_events','booking_reservation_records','field_confirmation_policies','booking_platform_policy'])await q.dropTable(name,{transaction});await q.removeColumn('payments','bookingId',{transaction});});}
};
