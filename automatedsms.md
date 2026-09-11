### Automated SMS Sender ###

## Requirements ## 
Send sms to a list of users on particular scheduled time. The application takes an input of list of users from the contact list to send SMS at a particular scheduled time. 
The application can schedule multiple schedules at a time with different messages. For example sending a good morning message at 8:00 AM and sending a good night message at 21:00. Each of these schedule messages can be edited or rescheduled. They can be edited or removed for the list of schedule messages. 

## Tech Requirements ##
A React Native based application that can run on Andorid. The app needs to hosted on Indus AppStore for distribution. The app name is Sked SMS.

## The design Layout ##
The design layout like should have a create schedule button at the bottom right hand corner.

- On clicking the button the scheduler opens with mandatory fields to be filled like the recipeint which could be selected from the contact list of the phone. 

- The message box is also mandatory for the message to be sent. 
- The Date and time needs to be selected from date picker and time picker. 
no past dates can be selected. 
- The option of adding more schedule msg should be there.
- From the list the user can select a schedule edit it or delete it. 