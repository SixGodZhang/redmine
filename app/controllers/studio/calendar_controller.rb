# frozen_string_literal: true

module Studio
  class CalendarController < BaseController
    include QueriesHelper

    before_action :require_studio_login
    rescue_from Query::StatementInvalid, with: :query_statement_invalid

    def show
      year = params[:year].to_i
      month = params[:month].to_i
      year = User.current.today.year if year <= 1900
      month = User.current.today.month if month <= 0 || month > 12

      calendar = Redmine::Helpers::Calendar.new(Date.civil(year, month, 1), current_language, :month)
      retrieve_query(IssueQuery, false)
      @query.group_by = nil
      @query.sort_criteria = nil
      @query.add_filter('status_id', '*', [''])

      events = []
      if @query.valid?
        events += @query.issues(
          include: [:tracker, :assigned_to, :priority],
          conditions: [
            '((start_date BETWEEN ? AND ?) OR (due_date BETWEEN ? AND ?))',
            calendar.startdt, calendar.enddt,
            calendar.startdt, calendar.enddt
          ]
        )
        events += @query.versions(
          conditions: ['effective_date BETWEEN ? AND ?', calendar.startdt, calendar.enddt]
        )
        calendar.events = events
      end

      render json: {
        year: year,
        month: month,
        start: calendar.startdt,
        end: calendar.enddt,
        events: events.map { |e| serialize_event(e) }
      }
    end

    private

    def serialize_event(event)
      if event.is_a?(Issue)
        {
          type: 'issue',
          id: event.id,
          title: "##{event.id} #{event.subject}",
          date: event.due_date || event.start_date,
          start_date: event.start_date,
          due_date: event.due_date,
          project_id: event.project_id,
          url: "/issues/#{event.id}"
        }
      else
        {
          type: 'version',
          id: event.id,
          title: event.name,
          date: event.effective_date,
          project_id: event.project_id,
          url: nil
        }
      end
    end
  end
end
