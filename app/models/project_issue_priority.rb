# frozen_string_literal: true

class ProjectIssuePriority < ApplicationRecord
  belongs_to :project
  belongs_to :issue_priority, class_name: 'IssuePriority'
end
