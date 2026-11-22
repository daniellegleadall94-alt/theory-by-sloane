export type CalendarContentFilters={contentOnly:boolean;channel:string;campaign:string;publicationStatus:string};
export const emptyCalendarContentFilters:CalendarContentFilters={contentOnly:false,channel:'',campaign:'',publicationStatus:''};
type FilterItem={channel?:string;task?:{contentOutput?:boolean;campaign?:string;publicationStatus?:string}};
export function matchesCalendarContent(item:FilterItem,filters:CalendarContentFilters){
 return (!filters.contentOnly||item.task?.contentOutput===true)&&(!filters.channel||item.channel===filters.channel)&&(!filters.campaign||item.task?.campaign===filters.campaign)&&(!filters.publicationStatus||item.task?.contentOutput===true&&item.task.publicationStatus===filters.publicationStatus);
}
